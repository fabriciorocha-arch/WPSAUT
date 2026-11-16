import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
  makeCacheableSignalKeyStore,
  proto,
  WAMessageKey,
  CacheStore,
  GroupMetadata,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import {
  WhatsAppConnectionState,
  WhatsAppProviderMode,
  MetaCloudConfig,
  EvolutionApiConfig,
} from '../src/types/index.ts';
import {
  normalizeWhatsAppDigits,
  getWhatsAppPhoneCandidates,
  toWhatsAppJid,
  extractBaileysMessageText,
  shouldProcessUpsertMessage,
  extractIncomingContactInfo,
  isGroupJid,
  isBotMentionedInBaileysMessage,
} from '../src/utils/whatsapp-utils.ts';
import { formatPhoneBR } from '../src/utils/crm-analytics.ts';

export interface IncomingMessageHandlerPayload {
  phone: string;
  senderName?: string;
  text: string;
  replyJid?: string;
  isGroup?: boolean;
  groupName?: string;
  participantCount?: number;
  participantName?: string;
  participantPhone?: string;
  isMentioned?: boolean;
}

type OnMessageCallback = (payload: IncomingMessageHandlerPayload) => Promise<string | null>;
type OnStateChangeCallback = (state: WhatsAppConnectionState) => void;

const AUTH_DIR = path.resolve(process.cwd(), 'wa_auth');

function createMemoryCacheStore(): CacheStore {
  const map = new Map<string, any>();
  return {
    get<T>(key: string): T | undefined {
      return map.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      if (map.size > 5000) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) map.delete(firstKey);
      }
      map.set(key, value);
    },
    del(key: string): void {
      map.delete(key);
    },
    flushAll(): void {
      map.clear();
    },
  };
}

export class WhatsAppManager {
  private sock: WASocket | null = null;
  private manualDisconnect = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private onMessage: OnMessageCallback;
  private onStateChange: OnStateChangeCallback;
  private messageStore = new Map<string, proto.IMessage>();
  private groupMetadataCache = new Map<string, GroupMetadata>();
  private processedIncomingIds = new Set<string>();
  private msgRetryCounterCache = createMemoryCacheStore();
  private userDevicesCache = createMemoryCacheStore();

  public state: WhatsAppConnectionState;

  constructor(
    initialWebhookUrl: string,
    onMessage: OnMessageCallback,
    onStateChange: OnStateChangeCallback,
    savedMeta?: MetaCloudConfig,
    savedEvolution?: EvolutionApiConfig,
    savedProvider?: WhatsAppProviderMode
  ) {
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;

    this.state = {
      provider: savedProvider || 'baileys_qr',
      status: 'disconnected',
      qrCodeDataUrl: null,
      pairingCode: null,
      connectedPhone: '',
      connectedName: '',
      lastError: null,
      webhookUrl: initialWebhookUrl,
      verifyToken: savedMeta?.verifyToken || 'zapflow_token_secret',
      metaConfig: savedMeta || {
        phoneNumberId: '',
        accessToken: '',
        verifyToken: 'zapflow_token_secret',
      },
      evolutionConfig: savedEvolution || {
        baseUrl: '',
        instanceName: '',
        apiKey: '',
      },
      autoReplyEnabled: true,
      groupAutoReplyEnabled: true,
      groupMentionOnly: false,
    };

    // Auto-resume if Baileys credentials already exist on disk
    if (this.state.provider === 'baileys_qr' && fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
      this.connectBaileys().catch((err) => {
        console.error('Failed to auto-resume Baileys session:', err);
      });
    } else if (
      this.state.provider === 'meta_cloud' &&
      this.state.metaConfig.phoneNumberId &&
      this.state.metaConfig.accessToken
    ) {
      this.state.status = 'connected';
      this.state.connectedPhone = `Meta ID: ${this.state.metaConfig.phoneNumberId}`;
    } else if (
      this.state.provider === 'evolution_api' &&
      this.state.evolutionConfig.baseUrl &&
      this.state.evolutionConfig.instanceName &&
      this.state.evolutionConfig.apiKey
    ) {
      this.state.status = 'connected';
      this.state.connectedPhone = `Instância: ${this.state.evolutionConfig.instanceName}`;
    }
  }

  private emitState() {
    this.onStateChange({ ...this.state });
  }

  public setWebhookUrl(url: string) {
    this.state.webhookUrl = url;
  }

  public setAutoReply(enabled: boolean) {
    this.state.autoReplyEnabled = enabled;
    this.emitState();
  }

  public setGroupAutoReply(enabled: boolean, mentionOnly?: boolean) {
    this.state.groupAutoReplyEnabled = enabled;
    if (mentionOnly !== undefined) {
      this.state.groupMentionOnly = mentionOnly;
    }
    this.emitState();
  }

  private async getOrFetchGroupMetadata(jid: string): Promise<GroupMetadata | null> {
    const cached = this.groupMetadataCache.get(jid);
    if (cached) return cached;
    if (!this.sock) return null;
    try {
      const meta = await this.sock.groupMetadata(jid);
      if (meta) {
        this.groupMetadataCache.set(jid, meta);
        return meta;
      }
    } catch {
      // ignore groupMetadata fetch failure
    }
    return null;
  }

  public async getJoinedGroups(): Promise<
    Array<{ jid: string; name: string; participantCount: number }>
  > {
    if (!this.sock || this.state.status !== 'connected') {
      return [];
    }
    try {
      const groupsMap = await this.sock.groupFetchAllParticipating();
      const list = Object.values(groupsMap || {}).map((meta) => {
        this.groupMetadataCache.set(meta.id, meta);
        return {
          jid: meta.id,
          name: meta.subject || `Grupo ${normalizeWhatsAppDigits(meta.id).slice(-4)}`,
          participantCount: Array.isArray(meta.participants) ? meta.participants.length : 0,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return list;
    } catch (err) {
      console.error('[WhatsApp] Erro ao listar grupos:', err);
      return [];
    }
  }

  private cacheMessage(
    id: string | null | undefined,
    message: proto.IMessage | null | undefined
  ) {
    if (!id || !message) return;
    if (this.messageStore.size >= 1500) {
      const oldest = this.messageStore.keys().next().value;
      if (oldest) this.messageStore.delete(oldest);
    }
    this.messageStore.set(id, message);
  }

  private markIncomingProcessed(id: string | null | undefined) {
    if (!id) return;
    if (this.processedIncomingIds.size >= 2000) {
      const oldest = this.processedIncomingIds.keys().next().value;
      if (oldest) this.processedIncomingIds.delete(oldest);
    }
    this.processedIncomingIds.add(id);
  }

  public async connectBaileys(pairingPhoneNumber?: string): Promise<WhatsAppConnectionState> {
    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.removeAllListeners('creds.update');
        await this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    if (pairingPhoneNumber && fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
      try {
        const creds = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'creds.json'), 'utf-8'));
        if (!creds.registered && !creds.me?.id) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
      } catch {
        // ignore
      }
    }

    this.state.provider = 'baileys_qr';
    this.state.status = 'connecting';
    this.state.lastError = null;
    this.state.qrCodeDataUrl = null;
    this.state.pairingCode = null;
    this.emitState();

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      let version: [number, number, number] | undefined;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch {
        // Fallback to Baileys v7 bundled WA Web version
      }

      const baileysLogger = pino({ level: 'warn' }) as any;

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        logger: baileysLogger,
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 30000,
        enableAutoSessionRecreation: true,
        enableRecentMessageCache: true,
        msgRetryCounterCache: this.msgRetryCounterCache,
        userDevicesCache: this.userDevicesCache,
        cachedGroupMetadata: async (jid: string) => this.groupMetadataCache.get(jid),
        getMessage: async (key: WAMessageKey): Promise<proto.IMessage | undefined> => {
          if (!key?.id) return undefined;
          return this.messageStore.get(key.id) || undefined;
        },
      });

      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('groups.upsert', (groups) => {
        for (const g of groups) {
          if (g?.id) this.groupMetadataCache.set(g.id, g);
        }
      });

      sock.ev.on('groups.update', (updates) => {
        for (const update of updates) {
          if (update?.id) {
            const existing = this.groupMetadataCache.get(update.id);
            if (existing) {
              this.groupMetadataCache.set(update.id, { ...existing, ...update });
            }
          }
        }
      });

      sock.ev.on('group-participants.update', ({ id }) => {
        if (id) this.groupMetadataCache.delete(id);
      });

      let pairingRequested = false;

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 300,
              color: {
                dark: '#0f172a',
                light: '#ffffff',
              },
            });
            this.state.qrCodeDataUrl = dataUrl;
            this.state.status = 'qr_ready';
            this.state.lastError = null;
            this.emitState();
          } catch (qrErr: any) {
            console.error('QR generation failed:', qrErr);
          }

          if (pairingPhoneNumber && !pairingRequested && !state.creds.registered) {
            pairingRequested = true;
            const candidates = getWhatsAppPhoneCandidates(pairingPhoneNumber);
            const digits = candidates[0] || normalizeWhatsAppDigits(pairingPhoneNumber);
            if (digits.length >= 10) {
              try {
                const code = await sock.requestPairingCode(digits);
                this.state.pairingCode = code;
                this.emitState();
              } catch (pairErr: any) {
                console.error('Pairing code error:', pairErr);
                this.state.lastError =
                  'Não foi possível gerar o código de pareamento. Tente via QR Code.';
                this.emitState();
              }
            }
          }
        }

        if (connection === 'open') {
          const userDigits = normalizeWhatsAppDigits(sock.user?.id || '');
          this.state.status = 'connected';
          this.state.qrCodeDataUrl = null;
          this.state.pairingCode = null;
          this.state.lastError = null;
          this.state.connectedPhone = userDigits ? formatPhoneBR(userDigits) : 'Conectado';
          this.state.connectedName = sock.user?.name || 'WhatsApp Conectado';
          console.log('[WhatsApp] Conectado com sucesso:', this.state.connectedPhone);
          this.emitState();
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          if (this.manualDisconnect || isLoggedOut) {
            if (isLoggedOut && fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
            this.state.status = 'disconnected';
            this.state.qrCodeDataUrl = null;
            this.state.pairingCode = null;
            this.state.connectedPhone = '';
            this.state.connectedName = '';
            if (isLoggedOut) {
              this.state.lastError =
                'Sessão desconectada no celular. Escaneie o QR Code novamente.';
            }
            this.sock = null;
            this.emitState();
          } else {
            this.state.status = 'connecting';
            this.emitState();
            this.reconnectTimer = setTimeout(() => {
              this.connectBaileys().catch((err) => console.error('Reconnect error:', err));
            }, 3000);
          }
        }
      });

      sock.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify' && event.type !== 'append') return;

        for (const msg of event.messages) {
          if (msg.key?.id && msg.message) {
            this.cacheMessage(msg.key.id, msg.message);
          }

          if (
            !shouldProcessUpsertMessage(
              event.type,
              msg as any,
              this.processedIncomingIds,
              Math.floor(Date.now() / 1000),
              { allowGroups: true }
            )
          ) {
            continue;
          }

          const remoteJid = msg.key.remoteJid!;
          if (msg.messageStubType && !msg.message) {
            console.warn(
              `[WhatsApp] Mensagem recebida sem payload decifrado (jid=${remoteJid}, stub=${msg.messageStubType}, params=${JSON.stringify(
                msg.messageStubParameters || []
              )})`
            );
            continue;
          }

          const text = extractBaileysMessageText(msg.message);
          if (!text.trim()) {
            continue;
          }

          this.markIncomingProcessed(msg.key.id);

          const isGroup = isGroupJid(remoteJid);
          let resolvedPnFromLid: string | null = null;
          if (!isGroup && remoteJid.endsWith('@lid') && !msg.key.remoteJidAlt) {
            try {
              resolvedPnFromLid =
                (await sock.signalRepository?.lidMapping?.getPNForLID(remoteJid)) || null;
            } catch {
              // ignore lidMapping lookup errors
            }
          } else if (
            isGroup &&
            msg.key.participant?.endsWith('@lid') &&
            !(msg.key as any).participantAlt
          ) {
            try {
              resolvedPnFromLid =
                (await sock.signalRepository?.lidMapping?.getPNForLID(msg.key.participant)) ||
                null;
            } catch {
              // ignore lidMapping lookup errors
            }
          }

          const contactInfo = extractIncomingContactInfo(msg.key as any, resolvedPnFromLid);
          const primaryReplyJid = contactInfo.replyJid || contactInfo.pnJid || remoteJid;

          let groupName: string | undefined;
          let participantCount: number | undefined;
          let isMentioned = false;
          if (isGroup) {
            const groupMeta = await this.getOrFetchGroupMetadata(remoteJid);
            groupName = groupMeta?.subject || `Grupo ${contactInfo.phoneDigits.slice(-4)}`;
            participantCount = Array.isArray(groupMeta?.participants)
              ? groupMeta.participants.length
              : undefined;
            isMentioned = isBotMentionedInBaileysMessage(msg.message, [
              sock.user?.id,
              (sock.user as any)?.lid,
            ]);
          }

          console.log(
            `[WhatsApp] Mensagem recebida (${event.type}, ${
              isGroup ? `grupo=${groupName}` : `privado=${contactInfo.phoneDigits}`
            }, replyJid=${primaryReplyJid}): ${text}`
          );

          try {
            const replyText = await this.onMessage({
              phone: contactInfo.phoneDigits,
              senderName: isGroup ? groupName : msg.pushName || undefined,
              text,
              replyJid: primaryReplyJid,
              isGroup,
              groupName,
              participantCount,
              participantName: msg.pushName || undefined,
              participantPhone: isGroup ? contactInfo.participantDigits : undefined,
              isMentioned,
            });

            if (!replyText) {
              console.log(
                `[WhatsApp] IA não respondeu para ${
                  isGroup ? groupName || primaryReplyJid : contactInfo.phoneDigits
                } (IA pausada ou filtro de menção).`
              );
              continue;
            }

            if (this.state.autoReplyEnabled && this.sock) {
              try {
                await this.sock.readMessages([msg.key]);
              } catch {
                // ignore read receipt failure
              }
              try {
                await this.sock.sendPresenceUpdate('composing', primaryReplyJid);
              } catch {
                // ignore presence failure
              }

              try {
                const sent = await this.sock.sendMessage(
                  primaryReplyJid,
                  { text: replyText },
                  isGroup ? { quoted: msg } : undefined
                );
                if (sent?.key?.id && sent.message) {
                  this.cacheMessage(sent.key.id, sent.message);
                }
                console.log(
                  `[WhatsApp] Resposta automática enviada para ${primaryReplyJid} (id: ${
                    sent?.key?.id || 'ok'
                  })`
                );
              } catch (directErr) {
                console.warn(
                  `[WhatsApp] Falha no envio direto para ${primaryReplyJid}:`,
                  directErr
                );
                if (!isGroup) {
                  const fallbackTarget = contactInfo.pnJid || contactInfo.phoneDigits;
                  const fallbackRes = await this.sendMessage(fallbackTarget, replyText);
                  if (!fallbackRes.delivered) {
                    console.error(
                      `[WhatsApp] Falha no fallback para ${fallbackTarget}: ${fallbackRes.error}`
                    );
                  }
                }
              }

              try {
                await this.sock.sendPresenceUpdate('paused', primaryReplyJid);
              } catch {
                // ignore
              }
            }
          } catch (err) {
            console.error('[WhatsApp] Erro ao processar/responder mensagem:', err);
          }
        }
      });

      return { ...this.state };
    } catch (err: any) {
      console.error('Baileys initialization error:', err);
      this.state.status = 'error';
      this.state.lastError = err?.message || 'Erro ao iniciar sessão do WhatsApp.';
      this.emitState();
      return { ...this.state };
    }
  }

  public async disconnectBaileys(wipeCreds = true): Promise<WhatsAppConnectionState> {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        if (wipeCreds) {
          await this.sock.logout();
        } else {
          this.sock.end(undefined);
        }
      } catch {
        try {
          this.sock.end(undefined);
        } catch {
          // ignore
        }
      }
      this.sock = null;
    }

    if (wipeCreds && fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }

    this.state.status = 'disconnected';
    this.state.qrCodeDataUrl = null;
    this.state.pairingCode = null;
    this.state.connectedPhone = '';
    this.state.connectedName = '';
    this.state.lastError = null;
    this.emitState();
    return { ...this.state };
  }

  public configureMetaCloud(config: MetaCloudConfig): WhatsAppConnectionState {
    this.manualDisconnect = true;
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }

    this.state.provider = 'meta_cloud';
    this.state.metaConfig = config;
    this.state.verifyToken = config.verifyToken || 'zapflow_token_secret';
    this.state.qrCodeDataUrl = null;
    this.state.pairingCode = null;
    this.state.lastError = null;

    if (config.phoneNumberId.trim() && config.accessToken.trim()) {
      this.state.status = 'connected';
      this.state.connectedPhone = `Meta ID: ${config.phoneNumberId.trim()}`;
      this.state.connectedName = 'WhatsApp Cloud API (Meta)';
    } else {
      this.state.status = 'disconnected';
      this.state.connectedPhone = '';
    }

    this.emitState();
    return { ...this.state };
  }

  public configureEvolutionApi(config: EvolutionApiConfig): WhatsAppConnectionState {
    this.manualDisconnect = true;
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        // ignore
      }
      this.sock = null;
    }

    this.state.provider = 'evolution_api';
    this.state.evolutionConfig = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
    };
    this.state.qrCodeDataUrl = null;
    this.state.pairingCode = null;
    this.state.lastError = null;

    if (config.baseUrl.trim() && config.instanceName.trim() && config.apiKey.trim()) {
      this.state.status = 'connected';
      this.state.connectedPhone = `Instância: ${config.instanceName.trim()}`;
      this.state.connectedName = 'Evolution API / Z-API';
    } else {
      this.state.status = 'disconnected';
      this.state.connectedPhone = '';
    }

    this.emitState();
    return { ...this.state };
  }

  private async resolveBaileysTargetJid(
    phoneOrJid: string
  ): Promise<{ jid: string | null; error?: string }> {
    if (!this.sock) return { jid: null, error: 'Socket WhatsApp não inicializado' };

    // If an explicit JID was already captured from WhatsApp (e.g. @lid or @s.whatsapp.net)
    if (phoneOrJid.includes('@')) {
      return { jid: phoneOrJid };
    }

    const candidates = getWhatsAppPhoneCandidates(phoneOrJid);
    if (candidates.length === 0) {
      return { jid: null, error: 'Número de telefone inválido.' };
    }

    try {
      const results = await this.sock.onWhatsApp(...candidates);
      if (Array.isArray(results) && results.length > 0) {
        const valid = results.find((r) => r.exists && r.jid);
        if (valid?.jid) {
          return { jid: valid.jid };
        }
        return {
          jid: null,
          error: `O número ${phoneOrJid} não possui conta ativa no WhatsApp (verifique DDI e DDD, ex: 5511999998888).`,
        };
      }
    } catch (lookupErr) {
      console.warn('[WhatsApp] Falha ao consultar onWhatsApp, usando JID padrão:', lookupErr);
    }

    return { jid: toWhatsAppJid(candidates[0]) };
  }

  public async sendMessage(
    phoneOrJid: string,
    text: string
  ): Promise<{
    delivered: boolean;
    provider: WhatsAppProviderMode;
    jid?: string;
    messageId?: string;
    error?: string;
  }> {
    if (!phoneOrJid || !text.trim()) {
      return {
        delivered: false,
        provider: this.state.provider,
        error: 'Número destino e mensagem são obrigatórios.',
      };
    }

    if (this.state.provider === 'baileys_qr') {
      if (!this.sock || this.state.status !== 'connected') {
        return {
          delivered: false,
          provider: 'baileys_qr',
          error: 'WhatsApp não está conectado. Escaneie o QR Code primeiro.',
        };
      }

      const resolved = await this.resolveBaileysTargetJid(phoneOrJid);
      if (!resolved.jid) {
        return {
          delivered: false,
          provider: 'baileys_qr',
          error: resolved.error || 'Não foi possível localizar o número no WhatsApp.',
        };
      }

      try {
        const sent = await this.sock.sendMessage(resolved.jid, { text });
        if (sent?.key?.id && sent.message) {
          this.cacheMessage(sent.key.id, sent.message);
        }
        console.log(
          `[WhatsApp] Mensagem enviada para ${resolved.jid} (id: ${sent?.key?.id || 'ok'})`
        );
        return {
          delivered: true,
          provider: 'baileys_qr',
          jid: resolved.jid,
          messageId: sent?.key?.id || undefined,
        };
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao enviar via Baileys:', err);
        return {
          delivered: false,
          provider: 'baileys_qr',
          error: err?.message || 'Falha ao enviar mensagem pelo WhatsApp.',
        };
      }
    }

    const digits = isGroupJid(phoneOrJid)
      ? phoneOrJid
      : getWhatsAppPhoneCandidates(phoneOrJid)[0] || normalizeWhatsAppDigits(phoneOrJid);

    if (this.state.provider === 'meta_cloud') {
      const { phoneNumberId, accessToken } = this.state.metaConfig;
      if (!phoneNumberId || !accessToken) {
        return {
          delivered: false,
          provider: 'meta_cloud',
          error: 'Credenciais Meta Cloud API não configuradas',
        };
      }
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: digits,
              type: 'text',
              text: { body: text },
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.text();
          return { delivered: false, provider: 'meta_cloud', error: errBody };
        }
        return { delivered: true, provider: 'meta_cloud', jid: digits };
      } catch (err: any) {
        return { delivered: false, provider: 'meta_cloud', error: err?.message };
      }
    }

    if (this.state.provider === 'evolution_api') {
      const { baseUrl, instanceName, apiKey } = this.state.evolutionConfig;
      if (!baseUrl || !instanceName || !apiKey) {
        return {
          delivered: false,
          provider: 'evolution_api',
          error: 'Credenciais Evolution API não configuradas',
        };
      }
      try {
        const response = await fetch(
          `${baseUrl}/message/sendText/${encodeURIComponent(instanceName)}`,
          {
            method: 'POST',
            headers: {
              apikey: apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              number: digits,
              text,
            }),
          }
        );
        if (!response.ok) {
          const errBody = await response.text();
          return { delivered: false, provider: 'evolution_api', error: errBody };
        }
        return { delivered: true, provider: 'evolution_api', jid: digits };
      } catch (err: any) {
        return { delivered: false, provider: 'evolution_api', error: err?.message };
      }
    }

    return { delivered: false, provider: this.state.provider, error: 'Provedor não suportado' };
  }
}

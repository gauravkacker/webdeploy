/**
 * WhatsApp Web Listener
 * Monitors WhatsApp Web messages and auto-parses appointment requests
 * 
 * This service:
 * 1. Injects a content script into WhatsApp Web
 * 2. Listens for incoming messages containing "Book" keyword
 * 3. Auto-parses appointment details
 * 4. Appends to Google Sheet
 * 5. Lets sync create appointments
 */

export interface WhatsAppMessage {
  from: string;           // Sender name/number
  text: string;           // Message text
  timestamp: string;      // ISO timestamp
  chatName: string;       // Chat/group name
}

export interface WhatsAppListenerConfig {
  enabled: boolean;
  googleSheetId: string;
  keyword: string;        // Default: "Book"
  autoAppend: boolean;    // Auto-append to sheet
  autoCreate: boolean;    // Auto-create appointments
}

/**
 * Start listening to WhatsApp Web messages
 * This injects a listener into the WhatsApp Web page
 */
export function startWhatsAppWebListener(config: WhatsAppListenerConfig): void {
  if (!config.enabled) {
    console.log('[WhatsApp Web] Listener disabled');
    return;
  }

  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.error('[WhatsApp Web] Not in browser environment');
    return;
  }

  // Inject listener script into WhatsApp Web
  injectWhatsAppListener(config);
}

/**
 * Inject listener into WhatsApp Web page
 */
function injectWhatsAppListener(config: WhatsAppListenerConfig): void {
  try {
    // Create a script that will run in the WhatsApp Web context
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.textContent = `
      (function() {
        console.log('[WhatsApp Web Injected] Listener started');
        
        // Store config in window for access
        window.__whatsappConfig = ${JSON.stringify(config)};
        window.__whatsappProcessedMessages = new Set();
        
        // Helper functions
        function getTextContent(el) {
          return el.innerText || el.textContent || '';
        }
        
        function extractSenderName(msgElement) {
          const senderEl = msgElement.querySelector('[data-testid="msg-sender"]');
          if (senderEl) return getTextContent(senderEl);
          
          const chatHeader = document.querySelector('[data-testid="chat-header-title"]');
          if (chatHeader) return getTextContent(chatHeader);
          
          return 'Unknown';
        }
        
        function extractChatName() {
          const chatHeader = document.querySelector('[data-testid="chat-header-title"]');
          return chatHeader ? getTextContent(chatHeader) : 'Unknown Chat';
        }
        
        // Listen for new messages - improved detection
        const observer = new MutationObserver(function(mutations) {
          try {
            // Look for message containers
            const messages = document.querySelectorAll('[data-testid="msg-container"]');
            
            messages.forEach(msg => {
              try {
                // Get unique message ID to avoid processing same message twice
                const msgId = msg.getAttribute('data-id') || msg.getAttribute('data-msg-id') || msg.textContent;
                
                if (window.__whatsappProcessedMessages.has(msgId)) {
                  return; // Already processed
                }
                
                const text = getTextContent(msg);
                const config = window.__whatsappConfig;
                
                // Check if message contains keyword (case-insensitive)
                if (text && text.toLowerCase().includes(config.keyword.toLowerCase())) {
                  window.__whatsappProcessedMessages.add(msgId);
                  
                  const messageData = {
                    text: text,
                    timestamp: new Date().toISOString(),
                    from: extractSenderName(msg),
                    chatName: extractChatName()
                  };
                  
                  console.log('[WhatsApp Web] Message captured:', messageData);
                  
                  window.parent.postMessage({
                    type: 'WHATSAPP_MESSAGE',
                    data: messageData
                  }, '*');
                }
              } catch (e) {
                console.error('[WhatsApp Web] Error processing message:', e);
              }
            });
          } catch (e) {
            console.error('[WhatsApp Web] Observer error:', e);
          }
        });
        
        // Start observing with more aggressive settings
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['data-id', 'data-msg-id']
        });
        
        console.log('[WhatsApp Web] Observer started, monitoring for keyword: ' + window.__whatsappConfig.keyword);
      })();
    `;
    
    document.head.appendChild(script);
    console.log('[WhatsApp Web] Listener injected successfully');
    
    // Listen for messages from injected script
    window.addEventListener('message', handleWhatsAppMessage);
    
  } catch (error) {
    console.error('[WhatsApp Web] Error injecting listener:', error);
  }
}

/**
 * Handle messages from WhatsApp Web listener
 */
async function handleWhatsAppMessage(event: MessageEvent): Promise<void> {
  if (event.data.type !== 'WHATSAPP_MESSAGE') {
    return;
  }

  const message: WhatsAppMessage = event.data.data;
  console.log('[WhatsApp Web] Processing message:', message);

  try {
    // Import parser
    const { parseWhatsAppMessage } = await import('./whatsapp-parser');
    const { validateParsedAppointment } = await import('./whatsapp-validator');
    const { appendToGoogleSheet } = await import('./google-sheets-service');
    const { addParsingLog, generateLogId } = await import('./db/whatsapp-parser-storage');

    // Parse the message
    const parseResult = parseWhatsAppMessage(message.text);

    if (!parseResult.success) {
      console.log('[WhatsApp Web] Parse failed:', parseResult.error);
      
      // Log failed parse
      const log = {
        id: generateLogId(),
        timestamp: message.timestamp,
        message: message.text,
        result: parseResult,
        clinicId: 'default',
      };
      addParsingLog(log);
      
      return;
    }

    // Validate
    const validationResult = validateParsedAppointment(parseResult.data!);

    if (!validationResult.valid) {
      console.log('[WhatsApp Web] Validation failed:', validationResult.errors);
      
      // Log failed validation
      const log = {
        id: generateLogId(),
        timestamp: message.timestamp,
        message: message.text,
        result: parseResult,
        validationResult,
        clinicId: 'default',
      };
      addParsingLog(log);
      
      return;
    }

    // Get config from localStorage
    const settings = localStorage.getItem('onlineAppointmentsSettings');
    if (!settings) {
      console.error('[WhatsApp Web] Settings not found');
      return;
    }

    const config = JSON.parse(settings);
    
    console.log('[WhatsApp Web] Config:', config);
    
    // Append to Google Sheet if configured
    let appendResult = undefined;
    if (config.whatsappParserGoogleSheetId) {
      console.log('[WhatsApp Web] Appending to Google Sheet:', config.whatsappParserGoogleSheetId);
      appendResult = await appendToGoogleSheet(
        config.whatsappParserGoogleSheetId,
        parseResult.data!
      );

      console.log('[WhatsApp Web] Append result:', appendResult);
    } else {
      console.warn('[WhatsApp Web] No Google Sheet ID configured');
    }

    // Log successful parse
    const log = {
      id: generateLogId(),
      timestamp: message.timestamp,
      message: message.text,
      result: parseResult,
      validationResult,
      appendResult,
      clinicId: 'default',
    };
    addParsingLog(log);

    console.log('[WhatsApp Web] ✓ Message processed successfully');
    
    // Dispatch event to notify UI
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('whatsappMessageProcessed', {
        detail: {
          message,
          parseResult,
          appendResult,
          success: true
        }
      }));
    }

  } catch (error) {
    console.error('[WhatsApp Web] Error processing message:', error);
  }
}

/**
 * Stop listening to WhatsApp Web messages
 */
export function stopWhatsAppWebListener(): void {
  window.removeEventListener('message', handleWhatsAppMessage);
  console.log('[WhatsApp Web] Listener stopped');
}

/**
 * Check if WhatsApp Web is open in current tab
 */
export function isWhatsAppWebOpen(): boolean {
  try {
    // Check multiple indicators that WhatsApp Web is loaded
    // 1. Check for chat list
    const chatList = document.querySelector('[data-testid="chat-list"]');
    if (chatList) return true;

    // 2. Check for main container
    const mainContainer = document.querySelector('[data-testid="main"]');
    if (mainContainer) return true;

    // 3. Check for conversation panel
    const conversationPanel = document.querySelector('[data-testid="conversation-panel"]');
    if (conversationPanel) return true;

    // 4. Check for any WhatsApp-specific elements
    const whatsappApp = document.querySelector('[data-app-root]');
    if (whatsappApp) return true;

    // 5. Check for message containers
    const messageContainer = document.querySelector('[data-testid="msg-container"]');
    if (messageContainer) return true;

    // 6. Fallback: check if we're on web.whatsapp.com
    if (window.location.hostname.includes('web.whatsapp.com')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get list of active chats from WhatsApp Web
 */
export function getActiveChats(): string[] {
  try {
    const chats: string[] = [];
    const chatElements = document.querySelectorAll('[data-testid="chat-list-item"]');
    
    chatElements.forEach(chat => {
      const nameEl = chat.querySelector('[data-testid="chat-list-item-title"]');
      if (nameEl) {
        const text = (nameEl as any).innerText || nameEl.textContent || '';
        if (text) chats.push(text);
      }
    });
    
    return chats;
  } catch {
    return [];
  }
}

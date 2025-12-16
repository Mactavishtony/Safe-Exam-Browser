import { io } from 'socket.io-client';
import { api } from './api';

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        if (this.socket?.connected) return;

        const token = api.getToken();
        if (!token) {
            console.warn('[Socket] No token available, skipping connection');
            return;
        }

        try {
            this.socket = io({
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000
            });

            this.socket.on('connect', () => {
                console.log('[Socket] Connected to server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            });

            this.socket.on('disconnect', (reason) => {
                console.log('[Socket] Disconnected:', reason);
                this.isConnected = false;
            });

            this.socket.on('connect_error', (error) => {
                console.error('[Socket] Connection error:', error.message);
                this.reconnectAttempts++;
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error('[Socket] Max reconnection attempts reached');
                }
            });

            this.socket.on('reconnect', (attemptNumber) => {
                console.log('[Socket] Reconnected after', attemptNumber, 'attempts');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            });

            this.socket.on('error', (error) => {
                console.error('[Socket] Error:', error);
            });

            // Forward events to listeners
            this.socket.onAny((event, data) => {
                const callbacks = this.listeners.get(event) || [];
                callbacks.forEach(cb => cb(data));
            });
        } catch (error) {
            console.error('[Socket] Failed to initialize:', error);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    isSocketConnected() {
        return this.isConnected && this.socket?.connected;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);

        return () => {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) callbacks.splice(index, 1);
        };
    }

    emit(event, data) {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn('[Socket] Cannot emit, not connected');
        }
    }

    // Admin actions
    warnStudent(sessionId, message) {
        this.emit('admin:warn', { targetSessionId: sessionId, message });
    }

    forceSubmit(sessionId) {
        this.emit('admin:forceSubmit', { targetSessionId: sessionId });
    }

    disqualifyStudent(sessionId, reason) {
        this.emit('admin:disqualify', { targetSessionId: sessionId, reason });
    }
}

export const socketService = new SocketService();
export default socketService;


import aedes from 'aedes';
import { createServer } from 'net';
import mqtt from 'mqtt';
import { Subject } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

class MQTTServer {
  constructor(port, wsPort) {
    this.port = port;
    this.wsPort = wsPort;
    this.mqttServer = aedes();
    this.tcpServer = createServer(this.mqttServer.handle);
    this.httpServer = http.createServer();
    this.io = new SocketIOServer(this.httpServer, { cors: { origin: '*' } });
    this.mqttClient = null;
    this.subscribers = {};
    this.wsClients = new Set();

    this.clientConnected$ = new Subject();
    this.clientDisconnected$ = new Subject();
    this.messagePublished$ = new Subject();
    this.clientSubscribed$ = new Subject();
    this.clientUnsubscribed$ = new Subject();
    this.webSocketClients = {};

    this.init();
  }

  init() {
    this.tcpServer.listen(this.port, () => {
      this.mqttClient = mqtt.connect(`mqtt://localhost:${this.port}`, {
        clientId: 'MQTT_SERVER_CLIENT',
      });
      console.log(`MQTT server started and listening on TCP port ${this.port}`);
    });

    this.httpServer.listen(this.wsPort, () => {
      console.log(`WebSocket (socket.io) server started and listening on port ${this.wsPort}`);
    });

    this.setupSocketIO();
    this.setupSubscriptions();
    this.setupEventHandlers();
  }

  setupSocketIO() {
    this.io.on('connection', (socket) => {
      console.log('New client connected via WebSocket', socket.id);
      this.webSocketClients[socket.id] = socket;

      socket.on('disconnect', () => {
        console.log('Client disconnected');
        delete this.webSocketClients[socket.id];
      });

      socket.on('IOT_DEVICES_REQUEST', (data) => {
        this.webSocketClients[data.id]?.emit('IOT_DEVICES', this.subscribers);
      });

      socket.on('IOT_TRIGGER', (data) => {
        const { topic, payload } = data;
        this.publishMessage(topic, JSON.stringify(payload));
      });
    });
  }

  broadcastIotSubscribers() {
    console.log('Current Subscribers:', JSON.stringify(this.subscribers, null, 2));
  }

  publishMessage(topic, message) {
    this.mqttClient.publish(topic, message);
  }

  handleClientConnected(client) {
    console.log(`New client connected: ${client.id}`);
  }

  handleClientDisconnected(client) {
    console.log(`Client disconnected: ${client.id}`);

    Object.keys(this.subscribers).forEach((topic) => {
      if (this.subscribers[client.id]) {
        delete this.subscribers[topic];
      }
    });

    this.broadcastIotSubscribers();
  }

  handleMessagePublished({ packet, client }) {
    if (client && client.id !== 'MQTT_SERVER_CLIENT') {
      console.log(`Message published by ${client.id}:`);
      const payload = packet.payload.toString() ? JSON.parse(packet.payload.toString()) : {};
      this.subscribers[client.id] = { ...this.subscribers[client.id], ...payload };
    }
  }

  handleClientSubscribed({ subscriptions, client }) {
    subscriptions.forEach((sub) => {
      console.log(`Client ${client.id} subscribed to ${sub.topic}`);
      this.subscribers[client.id] = { ...(this.subscribers[client.id] || {}), topic: sub.topic };
    });
    this.broadcastIotSubscribers();
  }

  handleClientUnsubscribed({ subscriptions, client }) {
    subscriptions.forEach((sub) => {
      console.log(`Client ${client.id} unsubscribed from ${sub}`);
    });
    this.broadcastIotSubscribers();
  }

  setupSubscriptions() {
    this.clientConnected$.pipe(tap((client) => this.handleClientConnected(client))).subscribe();

    this.clientDisconnected$
      .pipe(tap((client) => this.handleClientDisconnected(client)))
      .subscribe();

    this.messagePublished$
      .pipe(
        filter(({ client }) => !!client),
        tap((event) => this.handleMessagePublished(event))
      )
      .subscribe();

    this.clientSubscribed$.pipe(tap((event) => this.handleClientSubscribed(event))).subscribe();
    this.clientUnsubscribed$.pipe(tap((event) => this.handleClientUnsubscribed(event))).subscribe();
  }

  setupEventHandlers() {
    this.mqttServer.on('client', (client) => this.clientConnected$.next(client));
    this.mqttServer.on('clientDisconnect', (client) => this.clientDisconnected$.next(client));
    this.mqttServer.on('publish', (packet, client) =>
      this.messagePublished$.next({ packet, client })
    );
    this.mqttServer.on('subscribe', (subscriptions, client) =>
      this.clientSubscribed$.next({ subscriptions, client })
    );
    this.mqttServer.on('unsubscribe', (subscriptions, client) =>
      this.clientUnsubscribed$.next({ subscriptions, client })
    );
  }

  getSubscribers() {
    return this.subscribers;
  }
}

export default MQTTServer;

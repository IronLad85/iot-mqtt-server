// MQTTServer.js

import aedes from 'aedes';
import { createServer } from 'net';
import mqtt from 'mqtt';
import { Subject } from 'rxjs';
import { filter, tap } from 'rxjs/operators';

class MQTTServer {
  constructor(port) {
    this.port = port;
    this.mqttServer = aedes();
    this.serverInstance = createServer(this.mqttServer.handle);
    this.mqttClient = null;
    this.subscribers = {};

    this.clientConnected$ = new Subject();
    this.clientDisconnected$ = new Subject();
    this.messagePublished$ = new Subject();
    this.clientSubscribed$ = new Subject();
    this.clientUnsubscribed$ = new Subject();

    this.init();
  }

  init() {
    this.serverInstance.listen(this.port, () => {
      this.mqttClient = mqtt.connect(`mqtt://localhost:${this.port}`);
      console.log(`Server started and listening on port ${this.port}`);
    });

    this.setupSubscriptions();
    this.setupEventHandlers();
  }

  publishMessage(topic, message) {
    this.mqttClient.publish(topic, message);
  }

  setupSubscriptions() {
    this.clientConnected$
      .pipe(tap((client) => console.log(`New client connected: ${client.id}`)))
      .subscribe();

    this.clientDisconnected$
      .pipe(
        tap((client) => {
          console.log(`Client disconnected: ${client.id}`);
          Object.keys(this.subscribers).forEach((topic) => {
            this.subscribers[topic] = this.subscribers[topic].filter((id) => id !== client.id);
            if (this.subscribers[topic].length === 0) {
              delete this.subscribers[topic];
            }
          });
        }),
        tap(() => this.logSubscribers())
      )
      .subscribe();

    this.messagePublished$
      .pipe(
        filter(({ client }) => !!client),
        tap(({ packet, client }) => {
          console.log(`Message published by ${client.id}:`, packet.payload.toString());
        })
      )
      .subscribe();

    this.clientSubscribed$
      .pipe(
        tap(({ subscriptions, client }) => {
          subscriptions.forEach((sub) => {
            console.log(`Client ${client.id} subscribed to ${sub.topic}`);
            this.publishMessage(sub.topic, JSON.stringify({ type: 'LED_EFFECT', EFFECT_NO: 71 }));
            if (!this.subscribers[sub.topic]) {
              this.subscribers[sub.topic] = [];
            }
            if (!this.subscribers[sub.topic].includes(client.id)) {
              this.subscribers[sub.topic].push(client.id);
            }
          });
        }),
        tap(() => this.logSubscribers())
      )
      .subscribe();

    this.clientUnsubscribed$
      .pipe(
        tap(({ subscriptions, client }) => {
          subscriptions.forEach((sub) => {
            console.log(`Client ${client.id} unsubscribed from ${sub}`);
            if (this.subscribers[sub]) {
              this.subscribers[sub] = this.subscribers[sub].filter((id) => id !== client.id);
              if (this.subscribers[sub].length === 0) {
                delete this.subscribers[sub];
              }
            }
          });
        }),
        tap(() => this.logSubscribers())
      )
      .subscribe();
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

  logSubscribers() {
    console.log('Current Subscribers:', JSON.stringify(this.subscribers, null, 2));
  }

  getSubscribers() {
    return this.subscribers;
  }
}

export default MQTTServer;

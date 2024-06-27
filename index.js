import MQTTServer from './mqtt-server.js';
const MQTT_PORT = 1883;
const WS_PORT = 9999;
const mqttServerInstance = new MQTTServer(MQTT_PORT, WS_PORT);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit();
});

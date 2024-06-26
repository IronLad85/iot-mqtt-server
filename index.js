import MQTTServer from './mqtt-server.js';
const PORT = 1883;

const mqttServerInstance = new MQTTServer(PORT);

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit();
});

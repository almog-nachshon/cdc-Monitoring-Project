const { Kafka } = require("kafkajs");
const express = require("express");
const client = require("prom-client");
const { Client: ESClient } = require("@elastic/elasticsearch");

const kafkaBroker = process.env.KAFKA_BROKER || "kafka:9092";
const kafkaTopic = process.env.KAFKA_TOPIC || "tidb-cdc";
const esUrl = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";
const esIndex = process.env.ELASTICSEARCH_INDEX || "cdc-events";

const es = new ESClient({ node: esUrl });

const app = express();
const register = new client.Registry();

// default process metrics
client.collectDefaultMetrics({ register });

const cdcCounter = new client.Counter({
  name: "cdc_events_total",
  help: "Total CDC events received",
  labelNames: ["table", "op"]
});

register.registerMetric(cdcCounter);

// expose /metrics for Prometheus
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

const port = 3000;
app.listen(port, () => {
  console.log(`Metrics server listening on port ${port}`);
});

// Kafka consumer
const kafka = new Kafka({
  clientId: "tidb-cdc-consumer",
  brokers: [kafkaBroker]
});

const consumer = kafka.consumer({ groupId: "cdc-consumer-group" });

async function run() {
  await consumer.connect();
  console.log("Connected to Kafka", kafkaBroker);

  await consumer.subscribe({ topic: kafkaTopic, fromBeginning: true });
  console.log("Subscribed to topic", kafkaTopic);

  // ensure index
  try {
    const exists = await es.indices.exists({ index: esIndex });
    if (!exists) {
      await es.indices.create({
        index: esIndex,
        body: {
          mappings: {
            properties: {
              database: { type: "keyword" },
              table: { type: "keyword" },
              type: { type: "keyword" },
              ts_ms: { type: "date", format: "epoch_millis" },
              data: { type: "object", enabled: true }
            }
          }
        }
      });
      console.log("Created index", esIndex);
    }
  } catch (err) {
    console.error("Error ensuring ES index:", err.message);
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const raw = message.value.toString();
        // TiCDC canal-json protocol
        const event = JSON.parse(raw);

        const database = event.database || "unknown_db";
        const table = event.table || "unknown_table";
        const op = (event.type || "unknown").toLowerCase();

        console.log("CDC event:", { database, table, op });

        // index in Elasticsearch
        await es.index({
          index: esIndex,
          body: {
            database,
            table,
            type: op,
            ts_ms: Date.now(),
            data: event.data || null
          }
        });

        // increment Prometheus counter
        cdcCounter.labels(table, op).inc();
      } catch (err) {
        console.error("Error processing message:", err.message);
      }
    }
  });
}

run().catch((e) => {
  console.error("Consumer failed:", e);
  process.exit(1);
});

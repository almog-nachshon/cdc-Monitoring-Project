#!/bin/sh
set -eu

echo "[cdc-init] Waiting for TiCDC to be ready..."
sleep 45

echo "[cdc-init] Creating TiCDC changefeed: cf-kafka"
curl -X POST http://ticdc:8300/api/v1/changefeeds \
  -H "Content-Type: application/json" \
  -d "{\"changefeed_id\":\"cf-kafka\",\"sink_uri\":\"kafka://kafka:9092/tidb-cdc?protocol=canal-json\",\"start_ts\":0}"

echo "[cdc-init] Changefeed creation completed"
sleep 2

echo "[cdc-init] Verifying changefeed exists:"
curl http://ticdc:8300/api/v1/changefeeds

echo "[cdc-init] Done"

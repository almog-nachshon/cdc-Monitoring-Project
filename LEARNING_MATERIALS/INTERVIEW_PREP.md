# Interview Preparation Guide - CDC Monitoring Solution

**Author:** Almog Nachshon  
**Created:** 2025-11-15  
**Purpose:** Q&A for physical review preparation

---

## TABLE OF CONTENTS

1. [Architecture Questions](#architecture-questions)
2. [Technology Choices](#technology-choices)
3. [Implementation Details](#implementation-details)
4. [Problem Solving](#problem-solving)
5. [System Design](#system-design)
6. [Debugging & Troubleshooting](#debugging--troubleshooting)
7. [Production Readiness](#production-readiness)
8. [Scaling & Performance](#scaling--performance)

---

## ARCHITECTURE QUESTIONS

### Q: Walk me through the complete data flow when a user inserts a record into the database.

**A:** 
```
1. User/Application executes: INSERT INTO users VALUES (...)

2. TiDB Database:
   - Writes to RocksDB storage engine
   - Records transaction in WAL (Write-Ahead Log)
   - Commit point reached

3. TiCDC Captures Change:
   - TiCDC monitors TiDB transaction log continuously
   - Detects INSERT operation
   - Converts to Canal JSON format
   - Includes: database, table, operation type, row data, timestamp

4. Kafka Receives Event:
   - TiCDC publishes Canal JSON to Kafka topic "tidb-cdc"
   - Message is durably persisted in Kafka broker
   - Single partition used (sequential ordering)

5. Consumer Processes:
   - Node.js consumer subscribed to tidb-cdc topic
   - Polls message from Kafka
   - Parses JSON payload
   - Extracts: database="appdb", table="users", op="insert", data={...}

6. Elasticsearch Indexing:
   - Consumer transforms message (adds @timestamp, restructures data)
   - Sends HTTP request to Elasticsearch
   - ES indexes document in "cdc-events" index
   - Document immediately searchable

7. Prometheus Metrics:
   - Consumer increments counter: cdc_events_total{table="users",op="insert"}++
   - Metric value now = 2 (if was 1)

8. Prometheus Scrapes:
   - Every 10 seconds, Prometheus scrapes consumer:3000/metrics
   - Stores new metric value with timestamp
   - Creates time-series datapoint: (2, timestamp)

9. Grafana Visualization:
   - Dashboard polls ES for recent events (Table panel)
   - Dashboard polls Prometheus for metrics (Pie chart)
   - Both refresh every 30 seconds

10. Final Result:
    - Grafana dashboard shows new event in table
    - Pie chart updates with new count
    - Kibana search shows document
    - End-to-end latency: ~200-500ms
```

**Key points to emphasize:**
- Real-time (not polling)
- At-least-once delivery guarantee
- Decoupled systems (Kafka bridges them)
- Multiple observability paths (ES logs, Prometheus metrics)

---

### Q: Why did you choose this specific architecture?

**A:**
```
REQUIREMENTS MET:
1. Real-time CDC: TiCDC provides instant capture
2. Reliable Delivery: Kafka ensures messages aren't lost
3. Data Storage: Elasticsearch for full event search
4. Monitoring: Prometheus for operational metrics
5. Visualization: Grafana for live dashboards

ALTERNATIVE CONSIDERED:
Alternative: Direct TiDB → Elasticsearch
Problems:
  - No buffering → Data loss if ES down
  - Tight coupling → Hard to change systems
  - No replayability → Can't reprocess events
  - Single path → No redundancy

Chosen Architecture Benefits:
✓ Decoupling: Systems independent
✓ Scalability: Can add consumers, brokers
✓ Reliability: Message durability
✓ Flexibility: Multiple consumers possible
✓ Observability: Multiple data paths
✓ Replayability: Can reprocess topic
```

---

### Q: What happens if one component fails?

**A:**
```
TiDB Failure:
→ TiCDC detects no new changes
→ Existing data in Kafka preserved
→ Consumer processes backlog when TiDB recovers
→ No data loss

TiCDC Failure:
→ Changes not captured during outage
→ Kafka topic remains at last checkpoint
→ Upon recovery, TiCDC resumes from last checkpoint
→ Recent changes might be missed (depends on recovery time)
→ ISSUE: No recovery of missed changes (inherent CDC limitation)

Kafka Failure:
→ TiCDC keeps trying to publish
→ Messages queued in memory (can overflow)
→ Consumer receives nothing
→ Upon recovery, backlog processed
→ Guaranteed to catch up (durability)

Consumer Failure:
→ TiCDC keeps publishing to Kafka
→ Messages accumulate in Kafka topic
→ Consumer offset not advanced
→ Upon recovery, consumer resumes from last offset
→ Processes all queued messages
→ Zero data loss (at-least-once semantics)

Elasticsearch Failure:
→ Consumer keeps pulling from Kafka
→ Retries ES inserts with exponential backoff
→ Prometheus metrics still updated
→ When ES recovers, backlog processed
→ Messages might be reprocessed (idempotent by design)

Prometheus/Grafana Failure:
→ Consumer still increments metrics
→ Metrics lost (in-memory only)
→ Upon recovery, only new metrics collected
→ Historical data lost (not critical for monitoring)
```

---

## TECHNOLOGY CHOICES

### Q: Why TiDB instead of MySQL/PostgreSQL?

**A:**
```
TiDB Advantages:
✓ Distributed: Horizontal scaling out-of-box
✓ MySQL Compatible: Existing tools work
✓ HA: Built-in replication & failover
✓ ACID: Full transaction support
✓ TiCDC: Native CDC engine (no external tool)

MySQL Disadvantages:
✗ Single server (unless with external replication)
✗ MySQL binlog → external CDC needed (Debezium, etc.)
✗ Simpler but less scalable

For this assignment:
TiDB's native CDC (TiCDC) was perfect fit
No need for external CDC tool
Already built-in and battle-tested
```

---

### Q: Why Kafka instead of direct Elasticsearch?

**A:**
```
Kafka Benefits:
✓ Buffering: Handle traffic spikes
✓ Durability: Messages persisted, not lost if consumer down
✓ Replayability: Can reprocess entire topic
✓ Multiple Consumers: Different systems can consume (ES, DW, etc.)
✓ Decoupling: TiCDC doesn't care about consumer
✓ Scalability: Add partitions for throughput

Direct ES Problems:
✗ No Buffering: Data loss if ES slow/down
✗ Tight Coupling: Changes require both sides ready
✗ No Replay: Lost events gone forever
✗ Single Consumer: Only one system can process

Real-world Scenario:
Day 1: TiDB → Kafka → Elasticsearch (working)
Day 30: Need to add data warehouse analytics
  - With Kafka: Add second consumer (easy)
  - Without Kafka: Replay all events (impossible)
```

---

### Q: Why Elasticsearch instead of relational database?

**A:**
```
Elasticsearch Strengths:
✓ Full-text Search: Find events by any field
✓ Schema-less: Accept any JSON structure
✓ Fast Retrieval: Indexed, not sequential scans
✓ Aggregations: Built-in analysis capabilities
✓ UI (Kibana): Visual exploration without writing SQL

Use Cases:
- "Show me all INSERT events in last hour" → Fast (indexed)
- "Show me events containing username='test'" → Full-text
- "Group events by operation type" → Aggregations

Relational DB would be slower:
- Requires predefined schema
- Sequential scans for large event count
- Less suitable for exploratory queries
```

---

### Q: Why Prometheus instead of storing metrics in MySQL?

**A:**
```
Prometheus Strengths:
✓ Time-Series Optimized: Designed for metrics
✓ Pull-based: Application doesn't push (simpler)
✓ Efficient Storage: Compressed time-series
✓ PromQL: Powerful query language for metrics
✓ Alerting: Built-in alert rules
✓ Dashboarding: Native Grafana integration

MySQL would require:
✗ Denormalized schema for metrics
✗ Manual aggregation/rollup
✗ No native time-series optimization
✗ Complex queries for rates/percentiles

PromQL Advantage Example:
rate(cdc_events_total[1m])  # Events per minute
vs SQL:
SELECT (COUNT(*) - LAG(COUNT(*)) OVER (ORDER BY ts)) 
FROM metrics WHERE ts > NOW() - INTERVAL 1 MINUTE
```

---

## IMPLEMENTATION DETAILS

### Q: How does auto-provisioning work in Docker Compose?

**A:**
```
ARCHITECTURE:
docker-compose.yml defines 12 services with proper ordering

STARTUP SEQUENCE:
1. Independent services start (pd, elasticsearch, zookeeper, etc.)
2. Services with dependencies wait (depends_on)

SPECIFIC SEQUENCE FOR CDC:
1. PD starts (independent)
2. TiKV starts (after PD)
3. TiDB starts (after PD, TiKV)
4. TiCDC starts (after TiDB)
5. db-init service runs:
   - Waits for TiDB ready
   - Executes db/init.sql
   - Creates database, table, inserts seed user
   - Exits (one-time init container)
6. cdc-task service runs:
   - Waits for TiCDC ready
   - Sleeps 45 seconds (additional buffer)
   - Executes db/cdc-init.sh script
   - Script calls TiCDC API to create changefeed
   - Exits (one-time init container)
7. Consumer starts:
   - Connects to Kafka
   - Subscribes to tidb-cdc topic
   - Begins consuming and processing

VOLUMES:
- db/init.sql mounted to /docker-entrypoint-initdb.d/ (MySQL convention)
- db/cdc-init.sh mounted to /scripts/cdc-init.sh
- Both executed by services automatically

NETWORKING:
- All services on 'backend' Docker network
- Service names resolve via internal DNS
- External access via localhost:port
```

---

### Q: Why use a separate shell script (cdc-init.sh) instead of inline command?

**A:**
```
PROBLEM WITH INLINE COMMAND:
Docker Compose has variable interpolation issues

Example that fails:
  command: curl -X POST http://ticdc:8300/api/v1/changefeeds \
    -d '{"changefeed_id":"cf-kafka","sink_uri":"kafka://kafka:9092/..."}'
  
Issue: Dollar signs ($) get interpreted, JSON gets mangled

MULTIPLE FAILED ATTEMPTS:
1. Single line with $$ escaping → Still interpolated
2. Multiline with YAML folding (>) → Wrong command split
3. Multiline with pipes (|) → Entrypoint complexity

SOLUTION: Separate Script File
- db/cdc-init.sh is plain shell script
- No Docker Compose variable interpretation
- Clear, readable commands
- Easy to debug and test
- Mounted as volume

Benefits:
✓ No escaping issues
✓ Clean separation of concerns
✓ Reusable (run manually if needed)
✓ Version controlled
✓ Easy to modify

Script Content:
#!/bin/sh
sleep 45  # Wait for TiCDC
curl -X POST http://ticdc:8300/api/v1/changefeeds \
  -H "Content-Type: application/json" \
  -d '{"changefeed_id":"cf-kafka","sink_uri":"kafka://kafka:9092/tidb-cdc?protocol=canal-json","start_ts":0}' \
curl http://ticdc:8300/api/v1/changefeeds
```

---

### Q: How do you ensure database initialization is idempotent?

**A:**
```
PROBLEM:
If docker-compose is restarted, db-init runs again
Duplicate data would be inserted → Errors

SOLUTION: INSERT...SELECT...WHERE NOT EXISTS

Old (non-idempotent):
  INSERT INTO users VALUES (1, 'almog', ...);
  → Fails on second run (duplicate key)

New (idempotent):
  INSERT INTO users (id, username, password, email, created_at)
  SELECT 1, 'almog', 'Aa123456', 'almog@example.com', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE id = 1
  );
  → Succeeds on both runs (conditional insert)

Result:
- First run: Inserts user
- Second run: Checks if exists, skips insert
- Third run: Same as second
- Always safe to restart container
```

---

### Q: Explain the Node.js consumer application.

**A:**
```
PURPOSE:
Bridge between Kafka and storage/monitoring systems

KEY COMPONENTS:

1. Kafka Connection (kafkajs)
   - Connects to kafka:9092
   - Joins consumer group (auto-created)
   - Subscribes to tidb-cdc topic
   - Pulls messages continuously

2. Message Processing
   - Parses Canal JSON format
   - Extracts: database, table, operation, data, timestamp
   - Handles batch messages (Canal can send multiple in one)
   - Error handling & retries

3. Elasticsearch Integration
   - Creates HTTP client to elasticsearch:9200
   - Transforms message to ES document
   - Adds @timestamp for time-series indexing
   - Indexes to cdc-events index
   - Handles ES errors gracefully

4. Prometheus Metrics
   - Creates counter: cdc_events_total
   - Labels: table, op (operation type)
   - Increments on every message
   - Exposes via /metrics endpoint

5. HTTP Server
   - Listens on port 3000
   - Serves /metrics endpoint (Prometheus format)
   - Prometheus scrapes this every 10 seconds

Code Structure:
app.js → Main entry point
  ├─ Kafka consumer setup
  ├─ ES client setup
  ├─ Prometheus metrics setup
  ├─ Express server startup
  ├─ Consumer loop
  │  ├─ Receive message
  │  ├─ Parse JSON
  │  ├─ Index to ES
  │  ├─ Increment counter
  │  └─ Continue
  └─ Graceful shutdown

Failure Handling:
- Kafka connection fails → Retry with exponential backoff
- ES indexing fails → Log error, continue consuming
- Metrics endpoint fails → Still accessible
- Consumer crashes → Docker restarts
```

---

## PROBLEM SOLVING

### Q: No CDC events appearing in Elasticsearch. How would you debug?

**A:**
```
DEBUGGING CHECKLIST:

1. Verify TiDB has data
   docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb \
     -e "SELECT COUNT(*) FROM users;"
   → Should show seed user (1)

2. Verify Changefeed exists
   curl http://localhost:8300/api/v1/changefeeds
   → Should show {"id":"cf-kafka","state":"normal",...}
   → Check state: normal (not failed, stopped, etc.)

3. Verify Changefeed is capturing
   curl http://localhost:8300/api/v1/changefeeds | jq '.[] | .checkpoint_tso'
   → Should be recent timestamp (not zero)

4. Verify Kafka topic exists
   docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092
   → Should show "tidb-cdc" topic

5. Verify messages in Kafka
   docker-compose exec kafka kafka-console-consumer --topic tidb-cdc \
     --bootstrap-server localhost:9092 --max-messages 5 --from-beginning
   → Should show Canal JSON messages

6. Verify consumer is running
   docker-compose ps consumer
   → Should be "Up"

7. Check consumer logs
   docker-compose logs consumer -f
   → Look for errors, connection issues
   → Should see "Subscribed to topic" message

8. Verify Elasticsearch connectivity from consumer
   docker-compose exec consumer curl http://elasticsearch:9200/_health
   → Should return {"status":"green",...}

9. Insert test data
   docker compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb \
     -e "INSERT INTO users (username, password, email) VALUES ('debug', 'pass', 'debug@test.com');"

10. Check Elasticsearch after 5 seconds
    curl http://localhost:9200/cdc-events/_count
    → Should show {"count":2} (seed + new)

MOST COMMON ISSUES:
1. Changefeed not created → Restart cdc-task
2. Changefeed failed → Check logs: docker-compose logs ticdc
3. Consumer crashed → Check logs: docker-compose logs consumer
4. Network issues → Test connectivity: docker-compose exec consumer ping kafka
5. Elasticsearch full → Check disk space, clean if needed
```

---

### Q: Consumer is running but Prometheus metrics not increasing. What's wrong?

**A:**
```
DEBUGGING STEPS:

1. Check metrics endpoint
   curl http://localhost:3000/metrics
   → Should output Prometheus format text
   → Should include "cdc_events_total" lines

2. Check metrics value
   curl http://localhost:3000/metrics | grep cdc_events_total
   → Should show: cdc_events_total{table="users",op="insert"} N
   → If only one line with value "0", no events processed

3. Check consumer logs
   docker-compose logs consumer -f
   → Look for "Processing message" logs
   → Look for errors consuming from Kafka

4. Check if events exist in Kafka
   docker-compose exec kafka kafka-console-consumer --topic tidb-cdc \
     --bootstrap-server localhost:9092 --max-messages 1
   → If no output, no events in Kafka
   → Problem is upstream (TiCDC not publishing)

5. Check Prometheus scraping
   curl http://localhost:9090/api/v1/query?query=cdc_events_total
   → Should show current value
   → If "no data", Prometheus not scraping

6. Check Prometheus targets
   http://localhost:9090/targets
   → Look for consumer:3000 endpoint
   → Should be "Up"
   → If "Down", check network

MOST COMMON CAUSES:
1. Consumer crashed → Restart: docker-compose restart consumer
2. Not consuming messages → Check Kafka connection
3. Consumer receiving but not processing → Check error logs
4. Metrics not exposed → Check /metrics endpoint format
5. Prometheus not scraping → Check target configuration
```

---

## SYSTEM DESIGN

### Q: How would you handle 1000 events per second?

**A:**
```
CURRENT LIMITATIONS:
- Single Kafka partition (sequential)
- Single consumer instance
- Throughput: ~100-500 events/sec

SCALING STRATEGY:

1. Kafka Partitioning
   - Increase partitions to 10
   - TiCDC can parallelize across partitions
   - Each partition goes to different consumer
   - Throughput: 10x improvement possible

2. Multiple Consumer Instances
   - Deploy 10 consumer instances (Docker replicas)
   - Each subscribes to tidb-cdc topic
   - Kafka assigns partitions to instances
   - Auto load-balanced

3. Consumer Optimization
   - Batch inserts to Elasticsearch (reduce round-trips)
   - Async indexing (non-blocking)
   - Connection pooling
   - Batch Prometheus metrics updates

4. Elasticsearch Scaling
   - Multiple nodes (cluster)
   - Index sharding (more parallelism)
   - Refresh rate tuning

5. Infrastructure
   - More replicas for consumer
   - More Kafka brokers
   - ES cluster (5+ nodes)
   - Prometheus with remote storage

POTENTIAL THROUGHPUT:
Original: ~500 events/sec
Optimized: ~5000-10000 events/sec
With full cluster: 100k+ events/sec

TRADEOFFS:
- Complexity increases
- Cost increases  
- Maintenance burden
- But reliability improves
```

---

### Q: How would you implement filtering (e.g., only capture USER inserts, not updates)?

**A:**
```
APPROACH 1: Changefeed Filter (Recommended)
- TiCDC supports event filters
- Filter in changefeed configuration
- Reduces load on Kafka

Modified changefeed creation:
{
  "changefeed_id": "cf-kafka",
  "sink_uri": "kafka://kafka:9092/tidb-cdc?protocol=canal-json",
  "filter": {
    "rules": ["appdb.users.insert"],
    "ignore": []
  }
}

APPROACH 2: Consumer-side Filtering
- Consumer receives all events
- Filters before indexing
- More flexible (can change without changefeed restart)

In consumer:
if (message.type === 'INSERT') {
  // Index to ES
}

APPROACH 3: Separate Changefeeds
- Create multiple changefeeds
- Each with different filters
- Publish to different Kafka topics
- Different consumers for different topics

Examples:
- cf-inserts → only INSERT
- cf-updates → only UPDATE
- cf-deletes → only DELETE
```

---

## DEBUGGING & TROUBLESHOOTING

### Q: Services starting but system not working. Troubleshooting steps?

**A:**
```
SYSTEMATIC TROUBLESHOOTING:

Step 1: Verify All Services Running
  docker-compose ps
  → All should be "Up" (except db-init, cdc-task which are "Exited 0")
  → If any failed: docker-compose logs [service]

Step 2: Check Service Logs
  docker-compose logs db-init
  → Should show successful schema creation
  docker-compose logs cdc-task
  → Should show successful changefeed creation
  docker-compose logs consumer
  → Should show "Subscribed to topic" message

Step 3: Verify Database
  docker-compose exec -T mysql-client mysql -h tidb -P 4000 -uroot appdb \
    -e "SELECT * FROM users;"
  → Should show seed user

Step 4: Test Data Flow
  Insert test record
  Check Elasticsearch count increased
  Check Prometheus metrics increased
  
Step 5: Check Network Connectivity
  Test from consumer to Kafka:
  docker-compose exec consumer nc -zv kafka 9092
  → Should succeed
  
  Test from consumer to ES:
  docker-compose exec consumer curl http://elasticsearch:9200/_health
  → Should return JSON

Step 6: Look for Error Patterns
  docker-compose logs | grep -i error
  → Review all errors
  
  docker-compose logs | grep -i failed
  → Review all failures

Step 7: Nuclear Option (If Stuck)
  docker-compose down -v
  docker-compose up --build
  → Clean restart from scratch

COMMON ERROR MESSAGES:
- "Connection refused" → Service not ready, wait longer
- "No such file" → Volume mount issue
- "duplicate key" → Database not idempotent
- "kafka offset out of range" → Consumer group issue
- "no hosts available" → Network/DNS issue
```

---

## PRODUCTION READINESS

### Q: What changes would you make before deploying to production?

**A:**
```
AREAS TO ADDRESS:

1. Security
   ✓ Enable Elasticsearch authentication
   ✓ Enable TiDB user auth (not root)
   ✓ Use TLS for all connections
   ✓ Implement API authentication/authorization
   ✓ Encrypt data in transit and at rest
   ✗ Currently: All open (demo mode)

2. Monitoring & Alerting
   ✓ Add health checks
   ✓ Configure Prometheus alerts
   ✓ Set up log aggregation (ELK stack)
   ✓ Monitor consumer lag (important!)
   ✓ Alert on replication lag
   ✗ Currently: Basic monitoring only

3. Reliability
   ✓ Implement circuit breakers (failures)
   ✓ Add exponential backoff for retries
   ✓ Implement dead-letter queues
   ✓ Add comprehensive error handling
   ✓ Implement graceful degradation
   ✗ Currently: Best-effort

4. Performance
   ✓ Tune Kafka partitions based on load
   ✓ Batch operations in consumer
   ✓ Implement connection pooling
   ✓ Cache frequently accessed data
   ✓ Profile and optimize hotspots
   ✗ Currently: No optimization

5. Data Quality
   ✓ Validate data at each step
   ✓ Implement deduplication (idempotency)
   ✓ Data integrity checks
   ✓ Reconciliation jobs (audit)
   ✗ Currently: Trust the pipeline

6. Operational Readiness
   ✓ Runbooks for common issues
   ✓ Disaster recovery procedures
   ✓ Backup/restore procedures
   ✓ Scaling procedures
   ✓ Rollback procedures
   ✗ Currently: Ad-hoc

7. Configuration Management
   ✓ Externalize all configs (env vars)
   ✓ No hardcoded values
   ✓ Environment-specific configs
   ✓ Secrets management (not in code)
   ✓ Feature flags
   ✗ Currently: Some hardcoded values

8. Testing
   ✓ Unit tests for consumer logic
   ✓ Integration tests (end-to-end)
   ✓ Load tests (throughput verification)
   ✓ Chaos tests (failure scenarios)
   ✓ Data validation tests
   ✗ Currently: No automated tests

MOST CRITICAL FOR PRODUCTION:
1. Consumer lag monitoring (know if falling behind)
2. Error handling & retries (don't lose events)
3. Idempotency (handle duplicate processing)
4. Capacity planning (know limits)
5. Runbooks (know how to recover)
```

---

## SCALING & PERFORMANCE

### Q: How would you monitor consumer lag?

**A:**
```
CONSUMER LAG DEFINITION:
Offset lag = Latest offset in topic - Consumer's committed offset
Time lag = Time since message published - Current time

HIGH LAG MEANS:
- Consumer is slow
- Events accumulating in Kafka
- Processing is falling behind
- Could lead to data loss if Kafka retention exceeded

MONITORING STRATEGIES:

1. Via Prometheus (Recommended for this setup)
   Create custom metric in consumer:
   
   const consumerLag = new prometheus.Gauge({
     name: 'consumer_lag_records',
     help: 'Records behind in Kafka topic',
     labelNames: ['topic']
   });
   
   Periodic update (every 30 seconds):
   lag = (highWaterMark - consumerGroupOffset)
   consumerLag.labels(topic).set(lag);
   
   Query in Prometheus:
   consumer_lag_records{topic="tidb-cdc"}
   
   Alert if lag > 10000 records for 5 minutes

2. Via Kafka Tools
   docker-compose exec kafka kafka-consumer-groups \
     --group cdc-consumer-group \
     --bootstrap-server localhost:9092 \
     --describe
   
   Output shows lag per partition

3. In Grafana Dashboard
   Panel: consumer_lag_records (Gauge)
   Panel: rate(consumer_lag_records[1m]) (Trend)
   Panel: Histogram of lag over time

RESPONSE TO HIGH LAG:
- Scale consumer horizontally (more instances)
- Optimize consumer code (batch inserts)
- Check downstream system (ES slow?)
- Increase Kafka partitions (if not maxed)
- Reduce batch size (process more frequently)

RESPONSE TO GROWING LAG:
- Emergency: Stop consumer, scale out, resume
- Monitor: Check what changed
- Investigate: Profile bottleneck
- Fix: Address root cause
```

---

### Q: How would you ensure exactly-once semantics for critical events?

**A:**
```
CURRENT STATE: At-least-once delivery
- Consumer processes message
- Consumer increments counter
- Consumer indexes to ES
- Consumer commits offset
- Problem: If consumer crashes between index and commit,
           message reprocessed (duplicate count)

TO ACHIEVE EXACTLY-ONCE:

APPROACH 1: Transactional Writes (Recommended)
- Make all operations in single transaction
- Atomicity ensures all-or-nothing
- If consumer crashes, entire transaction rolled back

Implementation:
1. Start transaction
2. Index to ES (operation 1)
3. Increment Prometheus (operation 2)
4. Commit Kafka offset (operation 3)
5. Commit transaction

If crash at any point:
- Before commit: All rolled back, message reprocessed
- After commit: All consistent

Challenge: Prometheus doesn't support transactions
Solution: Accept eventual consistency for metrics
          (metrics are estimates anyway)

APPROACH 2: Idempotent Processing
- Accept duplicates
- Make operations idempotent
- Same result whether processed once or twice

For Elasticsearch:
- Use message ID as document ID
- Upsert instead of insert
- Duplicate = overwrite with same data

For Prometheus:
- Use gauge instead of counter
- Gauge = absolute value (idempotent)
- Same message = same gauge value

APPROACH 3: Deduplication
- Track processed message IDs
- In-memory set or database lookup
- Skip if already processed

Challenge: Needs shared state (distributed cache)
Solution: Redis for message ID set

Implementation:
1. Generate unique message ID from {database,table,pk_value}
2. Check Redis: if exists, skip
3. If not exists, process normally
4. Add to Redis with TTL (1 hour)
5. Continue

This approach:
✓ Handles duplicates
✓ Decoupled (no shared state)
✓ Scalable (Redis handles)
✓ Efficient (O(1) lookup)
```

---

### Q: How would you handle network partition between TiDB and TiCDC?

**A:**
```
SCENARIO: Network partition between TiDB and TiCDC

WHAT HAPPENS:
1. TiCDC detects connection loss
2. Tries to reconnect with backoff
3. During partition:
   - TiDB continues processing (nothing broken)
   - TiCDC misses events
   - Kafka receives nothing
   - Consumer waits (nothing to process)
   - Metrics stop increasing

WHEN PARTITION HEALS:
- TiCDC reconnects to TiDB
- Queries checkpoint (last processed TSO)
- Starts from next change after checkpoint
- Replays missed events
- Consumer receives events
- System recovers

IMPORTANT NOTES:
- Assumes partition < TiDB retention period
  (default: a few days)
- If partition > retention:
  → Missed events lost forever
  → Gap in event history
  → Data inconsistency risk

MITIGATION STRATEGIES:

1. Extended Retention
   - Keep more WAL logs
   - More storage needed
   - Longer recovery window

2. Monitoring
   - Monitor replication lag
   - Alert if lag growing
   - Alert if connection drops

3. Reconciliation
   - Periodic full sync
   - Snapshot → full reindex
   - Verify data consistency
   - Catch any missed events

4. Redundant CDC
   - Multiple CDC instances
   - One fails, other continues
   - More complex but resilient

5. Time-based Alerting
   - Alert if no events > threshold
   - Could indicate network issue
   - Enable quick response
```

---

## FINAL TIPS FOR REVIEW

### Remember to Explain

✅ **The Why**
- Don't just describe, explain decisions
- "We chose X because..." every technology

✅ **The How**
- Walk through code
- Explain algorithms
- Detail interactions

✅ **The What If**
- Anticipate failure scenarios
- Explain recovery
- Discuss tradeoffs

✅ **The Trade-offs**
- Every choice has cost
- Reliability vs Speed
- Simplicity vs Features
- Cost vs Performance

### Show Deep Understanding

✅ **Know Limitations**
- What breaks first under load?
- When does this architecture fail?
- What's the breaking point?

✅ **Know Alternatives**
- What else could you use?
- Why not those?
- What would you change with more resources?

✅ **Know Production Concerns**
- What worries you in production?
- What would you add?
- What's risky?

### Be Ready to Code

✅ **Explain Implementation**
- Can you write the consumer code?
- Can you modify the schema?
- Can you add a new metric?

✅ **Troubleshoot Live**
- Can you debug in the room?
- Can you add logging?
- Can you trace an issue?

---

**Created: 2025-11-15**  
**Author: Almog Nachshon**  
**Purpose: Interview Preparation Q&A**

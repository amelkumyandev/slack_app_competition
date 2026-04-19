# Test Lanes

The test tree is scaffolded up front so future branches can add coverage in the right place.

- `tests/unit` for business rules, validators, and policy checks
- `tests/integration` for API, persistence, SignalR, and access-control coverage
- `tests/e2e` for browser-driven scenarios
- `tests/load` for 100K-history and multi-user durability scenarios

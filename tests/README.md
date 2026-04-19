# Test Lanes

The test tree is scaffolded up front so future branches can add coverage in the right place.

- `tests/unit` for business rules, validators, and policy checks
- `tests/integration` for API, persistence, SignalR, and access-control coverage
- `tests/e2e` for Docker-stack smoke automation and user-journey checks
- `tests/load` for 100K-history, long-absent-user, and multi-user fan-out scenarios
- `tests/support` for shared QA script helpers and session management utilities

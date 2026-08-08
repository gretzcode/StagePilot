# Authorization & Permission Matrix

StagePilot defines strict permission boundaries per role.

## Role Capabilities Matrix

| Command / Action | Host | Control | Audience Display | Confidence Display |
|---|---|---|---|---|
| Create / Close Room | YES | NO | NO | NO |
| Approve / Reject Devices | YES | NO | NO | NO |
| Slide Next / Prev / Goto | YES | YES | NO | NO |
| Timer Start / Pause / Reset | YES | YES | NO | NO |
| Send Stage Brief | YES | YES | NO | NO |
| Blank Display | YES | YES | NO | NO |
| Takeover Active Controller | YES | YES | NO | NO |
| View Presentation Output | YES | YES | YES | YES |

## Device Lifecycle States

```text
JOIN REQUEST --> PENDING --> APPROVED --> CONNECTED
                   |           |
                   v           v
                REJECTED    DISCONNECTED / REVOKED
```

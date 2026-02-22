# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |
| `< 0.1.0` | No |

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Use a private report through GitHub Security Advisories:

- https://github.com/DerSarco/httprequesttracer_matecode/security/advisories/new

Include:

- Affected version/tag
- Reproduction steps
- Impact assessment
- Suggested mitigation (if known)

## Response Targets

- Initial acknowledgment: within 72 hours
- Triage and severity assessment: within 7 days
- Patch/release timeline: based on severity and exploitability

## Disclosure Policy

- We coordinate fixes privately first.
- We publish details after a fix is available or mitigation is documented.
- Credit is given to reporters unless anonymity is requested.

## Security Boundaries and Expectations

- This app is local-first and should not exfiltrate captured traffic.
- Host OS proxy must not be modified by tracing workflows.
- Emulator proxy changes must be reversible (`:0` cleanup).
- Sensitive data in headers/cookies should be masked or handled carefully.

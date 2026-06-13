# NP01 - Unavailable npm Scope

## Finding

Publishing `@catui/protocol` fails because the current npm account does not own
or have access to the `@catui` scope. npm reports this as `E404` during publish
and `E403` when querying the organization membership endpoint.

## Decision

Avoid the blocked scope for the public publish surface. Use unscoped package
names for the publishable packages and keep scoped `@catui/*` names only for
private workspace libraries.

## Risk

Existing external consumers of `@catui/*` would need migration. This repository
is still in the beta publish setup, so the change is acceptable before stable
external adoption.

## @lumimd/sdk

Shared models, API client, and React Query hooks for LumiMD apps.

### React Peer Dependency

The SDK does **not** bundle React. Consumers must provide their own compatible React version:

- Mobile (Expo) uses React 18.3.x / React Native 0.75.x.
- Web (Next.js) currently uses React 19.1.x.

Install whichever version your platform requires, then add the SDK:

```bash
npm install @lumimd/sdk
```

### React Query

`@tanstack/react-query` is also listed as a peer dependency. Supply the same version that your app already uses (>= 5.90) so the hook cache stays shared.


import { Platform } from 'react-native';
import { validateGatewayHandshake } from './gatewayHandshake';

export interface DiscoveredGateway {
  host: string;
  port: number;
  name: string;
  version?: string;
  url: string;
}

const DEFAULT_PORT = 18789;

const SCAN_TARGETS = [
  ...Array.from({ length: 20 }, (_, i) => `192.168.1.${i + 1}`),
  '192.168.1.100', '192.168.1.200', '192.168.1.254',
  ...Array.from({ length: 20 }, (_, i) => `192.168.0.${i + 1}`),
  '192.168.0.100', '192.168.0.200', '192.168.0.254',
  ...Array.from({ length: 10 }, (_, i) => `10.0.0.${i + 1}`),
  '10.0.0.100', '10.0.0.254',
  ...Array.from({ length: 10 }, (_, i) => `10.0.1.${i + 1}`),
  '10.0.1.100', '10.0.1.254',
  'localhost',
];

async function probeHost(host: string, port: number): Promise<DiscoveredGateway | null> {
  const handshake = await validateGatewayHandshake(`ws://${host}:${port}`, {
    timeoutMs: 2500,
  });

  if (!handshake.valid) {
    return null;
  }

  return {
    host,
    port,
    name: handshake.info?.agentName || handshake.info?.name || `Gateway (${host})`,
    version: handshake.info?.version,
    url: `ws://${host}:${port}`,
  };
}

export async function discoverGateways(
  options?: {
    customSubnet?: string;
    onProgress?: (checked: number, total: number) => void;
  }
): Promise<DiscoveredGateway[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  const targets = [...SCAN_TARGETS];

  if (options?.customSubnet) {
    const base = options.customSubnet.replace(/\.\d+$/, '');
    for (let i = 1; i <= 20; i++) targets.push(`${base}.${i}`);
    targets.push(`${base}.100`, `${base}.200`, `${base}.254`);
  }

  const unique = [...new Set(targets)];
  const total = unique.length;
  let checked = 0;

  const BATCH_SIZE = 15;
  const found: DiscoveredGateway[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((host) => probeHost(host, DEFAULT_PORT))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        found.push(r.value);
      }
    }
    checked += batch.length;
    options?.onProgress?.(checked, total);
  }

  return found;
}

export async function probeGateway(host: string, port = DEFAULT_PORT): Promise<DiscoveredGateway | null> {
  return probeHost(host, port);
}

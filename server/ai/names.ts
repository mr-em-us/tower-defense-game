const AI_NAMES = [
  'SENTINEL', 'AEGIS', 'BASTION', 'RAMPART', 'CITADEL',
  'VANGUARD', 'BULWARK', 'FORTRESS', 'WARDEN', 'PHALANX',
  'SPECTRE', 'NEXUS', 'ORACLE', 'TITAN', 'PHANTOM',
  'MIRAGE', 'VECTOR', 'CIPHER', 'PULSE', 'HELIX',
  'ONYX', 'PRISM', 'NOVA', 'FLUX', 'ECHO',
  'COBALT', 'RAVEN', 'ZENITH', 'APEX', 'EMBER',
  'KIRA', 'SABLE', 'DRIFT', 'IRON', 'STORM',
  'BLADE', 'FROST', 'SPARK', 'STATIC', 'WRAITH',
];

export function pickAIName(): string {
  return AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
}

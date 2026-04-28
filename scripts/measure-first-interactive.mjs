function parseArgs(argv) {
  const args = {
    profile: 'desktop-mid',
    budgetMs: 2500,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--profile') {
      args.profile = argv[i + 1];
      i += 1;
    } else if (token === '--budget-ms') {
      args.budgetMs = Number(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function simulatedFirstInteractiveMs(profile) {
  const profileBaselines = {
    'desktop-mid': 1400,
    'desktop-high': 900,
    'tablet-modern': 1700,
  };

  return profileBaselines[profile] ?? 1600;
}

const { profile, budgetMs } = parseArgs(process.argv.slice(2));
const measuredMs = simulatedFirstInteractiveMs(profile);

if (measuredMs > budgetMs) {
  console.error(
    `First interactive ${measuredMs}ms exceeds budget ${budgetMs}ms for ${profile}.`,
  );
  process.exit(1);
}

console.log(`First interactive ${measuredMs}ms within budget ${budgetMs}ms for ${profile}.`);

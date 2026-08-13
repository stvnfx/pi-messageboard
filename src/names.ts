// Mythology name pools for agent naming

const GREEK_MYTHOLOGY = [
	"Zeus",
	"Hera",
	"Poseidon",
	"Demeter",
	"Athena",
	"Apollo",
	"Artemis",
	"Ares",
	"Aphrodite",
	"Hephaestus",
	"Hermes",
	"Hestia",
	"Dionysus",
	"Hades",
	"Persephone",
	"Hecate",
	"Pan",
	"Eros",
	"Nike",
	"Tyche",
	"Charon",
	"Thanatos",
	"Hypnos",
	"Morpheus",
	"Atlas",
	"Prometheus",
	"Epimetheus",
	"Pandora",
	"Theseus",
	"Minotaur",
	"Heracles",
	"Perseus",
	"Orpheus",
	"Eurydice",
	"Achilles",
	"Hector",
	"Odysseus",
	"Penelope",
	"Circe",
	"Medea",
	"Jason",
	"Argos",
	"Sisyphus",
	"Tantalus",
	"Icarus",
	"Daedalus",
	"Minos",
	"Aegeus",
	"Cassandra",
	"Phoenix",
];

const NORSE_MYTHOLOGY = [
	"Odin",
	"Frigg",
	"Thor",
	"Baldr",
	"Tyr",
	"Heimdall",
	"Loki",
	"Sif",
	"Freya",
	"Freyr",
	"Njord",
	"Idunn",
	"Bragi",
	"Vidar",
	"Vali",
	"Modi",
	"Magni",
	"Hermod",
	"Forseti",
	"Ullr",
	"Ragnar",
	"Lagertha",
	"Bjorn",
	"Fenrir",
	"Jormungandr",
	"Sleipnir",
	"Hugin",
	"Munin",
	"Gungnir",
	"Mjolnir",
	"Asgard",
	"Valhalla",
	"Valkyrie",
	"Einherjar",
	"Norns",
	"Skadi",
	"Hel",
	"Aegir",
	"Ran",
	"Valkyrie",
];

const GAMING_FANTASY = [
	"Zelda",
	"Ganondorf",
	"Link",
	"Sheik",
	"Impa",
	"Midna",
	"Revali",
	"Urbosa",
	"Mipha",
	"Daruk",
	"Dovahkiin",
	"Alduin",
	"Paarthurnax",
	"Greybeard",
	"Ulfric",
	"Jiub",
	"Vivec",
	"Dagoth",
	"Nerevarine",
	"Sotha",
	"Arthas",
	"Sylvanas",
	"Thrall",
	"Jaina",
	"Illidan",
	"Malfurion",
	"Tyrande",
	"Kelthuzad",
	"Deathwing",
	"Alexstrasza",
];

// Deduplicate (Valkyrie appears twice in NORSE)
const ALL_NAMES = [
	...new Set([...GREEK_MYTHOLOGY, ...NORSE_MYTHOLOGY, ...GAMING_FANTASY]),
];

export function getRandomName(): string {
	return ALL_NAMES[Math.floor(Math.random() * ALL_NAMES.length)];
}

export function isValidName(name: string): boolean {
	return ALL_NAMES.includes(name);
}

export function generateSuffix(sessionId: string): string {
	// First 4 chars of session ID, hex
	return sessionId.slice(0, 4);
}

export function generateAgentId(name: string, suffix: string): string {
	return `${name}-${suffix}`;
}

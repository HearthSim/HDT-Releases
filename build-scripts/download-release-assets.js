const http = require("https");
const fs = require("fs");

const repo = "HDT-Releases";
const assetsDir = `${__dirname}/../tmp_asset_downloads`;

const tagName = process.argv[2];

if (!tagName) {
	console.error("Missing tag name argument");
	process.exit(1);
}

if (!/v\d+\.\d+\.\d+/.test(tagName)) {
	console.error("Invalid tag name");
	process.exit(1);
}

if (!fs.existsSync(assetsDir)) {
	fs.mkdirSync(assetsDir);
}

function fetchLatest() {
	return new Promise((resolve, reject) =>
		http.get(
			{
				host: "api.github.com",
				path: `/repos/HearthSim/${repo}/releases/latest`,
				headers: {
					"User-Agent": "request",
					Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
				},
			},
			(res) => {
				let json = "";
				res.on("data", (data) => (json += data));
				res.on("end", () => {
					if (res.statusCode !== 200) {
						return reject(
							new Error(
								`Failed to fetch the latest release: HTTP ${res.statusCode} ${json}`
							)
						);
					}
					resolve(JSON.parse(json));
				});
			}
		)
	);
}

function downloadFile(file, { optional = false } = {}) {
	console.log(`Downloading ${file}...`);

	function get(url, resolve) {
		http.get(url, (res) => {
			if (res.statusCode === 301 || res.statusCode === 302) {
				return get(res.headers.location, resolve);
			}
			resolve(res);
		});
	}

	return new Promise((resolve, reject) => {
		get(
			{
				host: "github.com",
				path: `/HearthSim/${repo}/releases/download/${tagName}/${file}`,
				headers: { "User-Agent": "request" },
			},
			(res) => {
				if (res.statusCode !== 200) {
					res.resume();
					if (optional && res.statusCode === 404) {
						console.log(`Skipping ${file} (not found)`);
						return resolve();
					}
					return reject(
						new Error(`Failed to download ${file}: HTTP ${res.statusCode}`)
					);
				}
				res.on("end", resolve);
				res.pipe(fs.createWriteStream(`${assetsDir}/${file}`));
			}
		);
	});
}

async function run() {
	console.log(`Verifying ${tagName} matches latest releases...`);
	const latestRelease = await fetchLatest();
	if (latestRelease.tag_name !== tagName) {
		throw new Error(
			`Latest release (${latestRelease.tag_name}) does not match ${tagName}`
		);
	}

	const version = tagName.slice(1);
	await downloadFile("releases.win.json");
	// legacy feed for Squirrel clients migrating to Velopack
	await downloadFile("RELEASES");
	await downloadFile("HDT-Installer.exe");
	// vpk skips the delta when there is no previous release to build it against
	await downloadFile(`HearthstoneDeckTracker-${version}-delta.nupkg`, {
		optional: true,
	});
	await downloadFile(`HearthstoneDeckTracker-${version}-full.nupkg`);
	console.log("Done.");
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

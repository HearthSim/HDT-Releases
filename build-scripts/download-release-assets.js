const http = require("https");
const fs = require("fs");

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

function fetchLatest(repo) {
	return new Promise((resolve) =>
		http.get(
			{
				host: "api.github.com",
				path: `/repos/HearthSim/${repo}/releases/latest`,
				headers: { "User-Agent": "request" },
			},
			(res) => {
				let json = "";
				res.on("data", (data) => (json += data));
				res.on("end", () => resolve(JSON.parse(json)));
			}
		)
	);
}

function downloadFile(repo, file, { optional = false } = {}) {
	console.log(`Downloading ${file}...`);

	function get(url, resolve, reject) {
		http.get(url, (res) => {
			if (res.statusCode === 301 || res.statusCode === 302) {
				res.resume();
				return get(res.headers.location, resolve, reject);
			}
			if (res.statusCode === 404 && optional) {
				res.resume();
				console.log(`${file} does not exist, skipping`);
				return resolve();
			}
			if (res.statusCode !== 200) {
				res.resume();
				return reject(
					new Error(`Downloading ${file} failed with status ${res.statusCode}`)
				);
			}
			res
				.pipe(fs.createWriteStream(`${assetsDir}/${file}`))
				.on("finish", resolve)
				.on("error", reject);
		}).on("error", reject);
	}

	return new Promise((resolve, reject) => {
		get(
			{
				host: "github.com",
				path: `/HearthSim/${repo}/releases/download/${tagName}/${file}`,
				headers: { "User-Agent": "request" },
			},
			resolve,
			reject
		);
	});
}

async function run() {
	console.log(`Verifying ${tagName} matches latest releases...`);
	const sqRelease = await fetchLatest("HDT-Releases");
	if (sqRelease.tag_name !== tagName) {
		throw new Error(
			`Latest Squirrel release (${sqRelease.tag_name}) does not match ${tagName}`
		);
	}

	const version = tagName.slice(1);
	await downloadFile("HDT-Releases", "RELEASES");
	await downloadFile("HDT-Releases", "releases.win.json");
	await downloadFile("HDT-Releases", "HDT-Installer.exe");
	// there is nothing to build a delta against on the first Velopack release
	await downloadFile(
		"HDT-Releases",
		`HearthstoneDeckTracker-${version}-delta.nupkg`,
		{ optional: true }
	);
	await downloadFile(
		"HDT-Releases",
		`HearthstoneDeckTracker-${version}-full.nupkg`
	);
	console.log("Done.");
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

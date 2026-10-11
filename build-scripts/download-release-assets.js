const http = require("https");
const fs = require("fs");

const assetsDir = `${__dirname}/../tmp_asset_downloads`;
// synced to a sub-path of the bucket, see SquirrelConnection.SquirrelRemoteUrls in HDT
const velopackAssetsDir = `${assetsDir}/velopack`;

const tagName = process.argv[2];

if (!tagName) {
	console.error("Missing tag name argument");
	process.exit(1);
}

if (!/v\d+\.\d+\.\d+/.test(tagName)) {
	console.error("Invalid tag name");
	process.exit(1);
}

fs.mkdirSync(velopackAssetsDir, { recursive: true });

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

function downloadFile(repo, file, { dir = assetsDir, optional = false } = {}) {
	console.log(`Downloading ${file} from ${repo}...`);

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
				.pipe(fs.createWriteStream(`${dir}/${file}`))
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
	// the Velopack release has to be published before the Squirrel one
	const vpRelease = await fetchLatest("HDT-Velopack-Releases");
	if (vpRelease.tag_name !== tagName) {
		throw new Error(
			`Latest Velopack release (${vpRelease.tag_name}) does not match ${tagName}`
		);
	}

	const version = tagName.slice(1);
	await downloadFile("HDT-Releases", "RELEASES");
	await downloadFile("HDT-Releases", "HDT-Installer.exe");
	await downloadFile(
		"HDT-Releases",
		`HearthstoneDeckTracker-${version}-delta.nupkg`
	);
	await downloadFile(
		"HDT-Releases",
		`HearthstoneDeckTracker-${version}-full.nupkg`
	);

	const velopack = { dir: velopackAssetsDir };
	await downloadFile("HDT-Velopack-Releases", "releases.win.json", velopack);
	await downloadFile("HDT-Velopack-Releases", "RELEASES", velopack);
	await downloadFile("HDT-Velopack-Releases", "HDT-Installer.exe", velopack);
	// there is nothing to build a delta against on the first Velopack release
	await downloadFile(
		"HDT-Velopack-Releases",
		`HearthstoneDeckTracker-${version}-delta.nupkg`,
		{ ...velopack, optional: true }
	);
	await downloadFile(
		"HDT-Velopack-Releases",
		`HearthstoneDeckTracker-${version}-full.nupkg`,
		velopack
	);
	console.log("Done.");
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

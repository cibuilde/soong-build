const fs = require('fs');
const https = require('https');

const puppeteer = require('puppeteer');

const branches_url = 'https://ci.android.com/builds/branches.json'
const status_url = 'https://ci.android.com/builds/branches/aosp-master/status.json'
const target_name = 'aosp_x86_64-userdebug'

const url_prefix = 'https://ci.android.com/builds/submitted/'
const url_suffix = '/aosp_x86_64-userdebug/latest/soong_ui/'
const files = [
    {'filename': 'combined-aosp_x86_64.ninja.gz'},
    {'filename': 'build-aosp_x86_64.ninja.gz'},
    {'filename': 'build-aosp_x86_64-package.ninja.gz'},
    {'path':'soong/', 'filename': 'build.ninja.gz'}
]
const click_url_suffix = '/aosp_x86_64-userdebug/latest/'
const click_files = [ 'manifest', 'module-info.json', 'installed-files.txt', 'installed-files-root.txt', 'installed-files-ramdisk.txt' ]

let save_file = (url, filename) => {
    https.get(url, res => {
        tmp_name = filename + '.tmp'
        const stream = fs.createWriteStream(tmp_name);
        res.pipe(stream);
        stream.on('finish', () => {
            stream.close();
            fs.rename(tmp_name, filename, () => {
                console.log("File Renamed: ", filename);
            })
            //console.log("Downloaded: " + filename);
        })
    })
}

let save_context = async (browser, url, filename) => {
    const page = await browser.newPage();
    /*const client = await page.target().createCDPSession();
    await client.send('Network.enable', {
      maxResourceBufferSize: 1024 * 1204 * 500,
      maxTotalBufferSize: 1024 * 1204 * 1000,
    })*/

    console.log(url)
    await page.goto(url);
    await page.waitForTimeout(5000)

    const button = (await page.waitForFunction(() => document.querySelector('#artifact_view_page').shadowRoot.querySelector('artifact-viewer').shadowRoot.querySelector('a.download')));

    await page.setRequestInterception(true);
    page.on('request', async (req) => {
        let download_url = req.url()
        if (download_url.includes(filename)) {
            //console.log("request: " + download_url + " " + filename)
            req.abort();
            save_file(download_url, filename)
        } else {
            req.continue();
        }
    });
    await button.click();
}

let download_files = async (build_id) => {
    const browser = await puppeteer.launch();

    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow', downloadPath: './'
    });

    // Configure the navigation timeout
    //await page.setDefaultNavigationTimeout(100000);

    /*await page.setRequestInterception(true);
    page.on('request', req => {
        console.log("request: " + req.url())
        req.continue();
    });*/

    const downloading = new Set();
    for (let filename of click_files) {
        if (filename == 'manifest') {
            filename = filename + '_' + build_id + '.xml'
        }
        downloading.add(filename)
    }
    for (const {filename} of files) {
        downloading.add(filename)
    }
    for (const filename of downloading) {
        const intervalObj = setInterval((f, s) => {
            if (fs.existsSync(f)) {
                console.log("Downloaded: " + f);
                clearInterval(intervalObj);
                s.delete(f)
                if (s.size == 0) {
                    console.log('Downloaded all');
                    browser.close();
                }
            }
        }, 1000, filename, downloading);
    }

    for (let i in files) {
        let url = ''
        if (files[i].path) {
            url = url_prefix + build_id + url_suffix + files[i].path + files[i].filename;
        } else {
            url = url_prefix + build_id + url_suffix + files[i].filename
        }

        console.log(url)
        await page.goto(url);
        await page.waitForTimeout(3000)
        //const button = (await page.waitForFunction(() => document.querySelector('#artifact_view_page').shadowRoot.querySelector('artifact-viewer').shadowRoot.querySelector('a.download'))).asElement();
        //await button.click();
    }

    for (let i in click_files) {
        let url = url_prefix + build_id + click_url_suffix + click_files[i]
        let filename = click_files[i]
        if (click_files[i] == 'manifest') {
            url = url + '_' + build_id + '.xml'
            filename = filename + '_' + build_id + '.xml'
        }
        await save_context(browser, url, filename)
    }
}

let parse_branches = () => {
    https.get(branches_url, resp => {
        let data = '';
        resp.on('data', (chunk) => {
            data += chunk;
        });
        resp.on('end', () => {
            let branches = JSON.parse(data).branches
            fs.writeFile('branches.txt', branches.join('\n'), err => {
                if (err) {
                    console.error(err);
                }
            });
        });
    }).on("error", (err) => {
        console.log("Error: " + err.message);
    })
}

let parse_status = () => {
    https.get(status_url, resp => {
        let data = '';
        resp.on('data', (chunk) => {
            data += chunk;
        });
        resp.on('end', () => {
            let targets = JSON.parse(data).targets
            let builds = targets.map(({ID, last_known_good_build, name}) => {
                if (name == target_name) {
                    let build_id = last_known_good_build;
                    console.log(build_id)
                    download_files(build_id)
                }
                return ({"name": ID, "build_id": last_known_good_build});
            })
            fs.writeFile('status.txt', JSON.stringify(builds, null, 2 ), err => {
                if (err) {
                    console.error(err);
                }
            });
        });
    }).on("error", (err) => {
        console.log("Error: " + err.message);
    })
}
parse_branches()
parse_status()

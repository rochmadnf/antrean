import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import imageToAscii from "image-to-ascii";
import { sleep } from "./constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_PATH = path.resolve(__dirname, "../");
const BPJS_STORAGE_PATH = path.join(BASE_PATH, "storage");

// ====== konfigurasi akun (ganti kalau mau ambil dari CLI) ======
const USERNAME = "pkmkamonji";
const PASSWORD = "Kamonji1234!!";
// =============================================================

let _gFilepath = "";

function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        })
    );
}

async function renderBufferAsAscii(buffer) {
    if (!fs.existsSync(BPJS_STORAGE_PATH)) {
        fs.mkdirSync(BPJS_STORAGE_PATH, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rnd = Math.floor(Math.random() * 10000);
    const filename = `captcha-${timestamp}-${rnd}.png`;
    const filepath = path.resolve(BPJS_STORAGE_PATH, filename);
    _gFilepath = filepath;
    fs.writeFileSync(filepath, buffer);

    try {
        await new Promise((resolve, reject) => {
            imageToAscii(filepath, { colored: true, size: { width: 80 } }, (err, converted) => {
                if (err) reject(err);
                else {
                    console.log(converted);
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error("Gagal konversi captcha ke ASCII:", err.message || err);
    } finally {
        try {
            // fs.unlinkSync(filepath);
        } catch (e) {
            console.warn("Gagal menghapus file sementara:", filepath, e.message);
        }
    }
}

async function loadCaptcha(page, { clickReload = true } = {}) {
    console.clear();

    const captchaResponsePromise = page.waitForResponse(
        (response) => {
            try {
                const url = response.url();
                const ct = (response.headers()["content-type"] || "").toLowerCase();
                return url.includes("BotDetectCaptcha.ashx") && ct.startsWith("image");
            } catch {
                return false;
            }
        },
        { timeout: 10000 }
    );

    if (clickReload) {
        await page.click("#AppCaptcha_ReloadLink").catch(() => { });
    }

    let response;
    try {
        response = await captchaResponsePromise;
    } catch (err) {
        console.error("Gagal menangkap response captcha:", err.message);
        return false;
    }

    const buffer = await response.buffer();
    await renderBufferAsAscii(buffer);
    return true;
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login", {
        waitUntil: "networkidle2",
    });

    const usernameSelector = 'input[name^="username_"]';
    const passwordSelector = 'input[name^="password_"]';
    const captchaSelector = "#CaptchaInputText";
    const submitSelector = "#btnLogin";

    let success = false;
    while (!success) {
        await page.waitForSelector(usernameSelector, { visible: true });
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.value = "";
        }, usernameSelector);
        await page.type(usernameSelector, USERNAME, { delay: 50 });

        await page.waitForSelector(passwordSelector, { visible: true });
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.value = "";
        }, passwordSelector);
        await page.type(passwordSelector, PASSWORD, { delay: 50 });

        const ok = await loadCaptcha(page, { clickReload: true });
        if (!ok) {
            console.warn("Tidak berhasil mengambil captcha, coba lagi...");
            continue;
        }

        let filled = false;
        while (!filled) {
            let captchaValue = await ask("\nMasukkan captcha (atau ketik 'r' untuk reload): ");
            if (captchaValue.trim().toLowerCase() === "r") {
                fs.unlinkSync(_gFilepath);
                await loadCaptcha(page, { clickReload: true });
                continue;
            }

            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.value = "";
            }, captchaSelector);
            await page.type(captchaSelector, captchaValue, { delay: 50 });

            const loginResponsePromise = page.waitForResponse((response) => {
                try {
                    return response.url().includes("/eclaim/Login/login") && response.request().method() === "POST";
                } catch {
                    return false;
                }
            });

            await page.click(submitSelector);

            let loginResponse;
            try {
                loginResponse = await loginResponsePromise;
            } catch (err) {
                console.error("Gagal menangkap response login:", err.message || err);
                continue;
            }

            let data = null;
            try {
                const ct = (loginResponse.headers()["content-type"] || "").toLowerCase();
                if (ct.includes("application/json")) {
                    data = await loginResponse.json();
                } else {
                    const txt = await loginResponse.text();
                    data = { raw: txt };
                }
            } catch (err) {
                // console.error("Gagal parse body response login:", err.message || err);
            }

            if (data?.metaData?.code === 428) {
                console.log("❌ Captcha salah — klik tombol OK pada modal & reload captcha...");
                fs.unlinkSync(_gFilepath);
                try {
                    await page.waitForSelector(".bootbox-accept", { visible: true, timeout: 5000 });
                    await page.click(".bootbox-accept");
                } catch { }
                filled = true;
                break;
            } else {
                console.log("✅ Login response:", data);
                fs.renameSync(
                _gFilepath,
                path.resolve(
                    path.join(BPJS_STORAGE_PATH, "data-train"),
                    captchaValue + ".jpeg"
                )
                );

                try {
                    if (!fs.existsSync(BPJS_STORAGE_PATH)) fs.mkdirSync(BPJS_STORAGE_PATH, { recursive: true });
                    const cookies = await page.cookies();
                    const userAgent = await page.evaluate(() => navigator.userAgent);

                    const dataToSave = {
                        userAgent,
                        cookies,
                        saved_at: new Date().toISOString(),
                    };

                    const cookiePath = path.resolve(BPJS_STORAGE_PATH, "bpjs-cookie.json");
                    fs.writeFileSync(cookiePath, JSON.stringify(dataToSave, null, 2));
                    console.log("🍪 Cookie berhasil disimpan ke:", cookiePath);
                } catch (e) {
                    console.warn("Gagal menyimpan cookie:", e.message);
                }

                success = true;
                filled = true;
                break;
            }
        }
    }

    try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 5000 });
    } catch { }

    // ✅ Cek elemen "KAMONJI (03190005), PALU"
    try {
        // cari span yang mengandung teks KAMONJI (lebih fleksibel, pakai includes)
        const found = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll("span.hidden-xs"));
            return spans.some(el => el.textContent.includes("KAMONJI (03190005), PALU"));
        });

        if (found) {
            console.log("🎉 Login berhasil, elemen KAMONJI ditemukan. Menutup browser...");
            await sleep(2500);
            await browser.close();
            console.clear();
            return;
        } else {
            console.warn("Elemen KAMONJI tidak ditemukan, mungkin login gagal.");
        }
    } catch (e) {
        console.error("Error mencari elemen KAMONJI:", e.message);
    }

})();

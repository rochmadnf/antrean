import { getAge, witaDate } from "../constants.js";
import {
  getConfigByGroupName,
  insertConfig,
  updateConfig,
} from "../database.js";
import { readFile } from "../storage.js";
import moment from "moment-timezone";

export const HOST = "https://api-v3.medikaconnect.com";
export const HEADERS = {
  Versi: "0.1.2",
  TE: "trailers",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  Authorization: "Basic c2lwZGlua2VzcGFsdTpDZUhjNUU4UXV2NmhOMUhy",
};
export const API_BASE = "https://api-v3.medikaconnect.com/v1";

export const LOGIN = async () => {
  const { username, password } = await readFile("./storage/sian.json");

  return await fetch(`${API_BASE}/auth/login/`, {
    method: "POST",
    headers: HEADERS,
    body: new URLSearchParams({
      username,
      password,
    }),
  });
};

export async function GET_SIAN_TOKEN() {
  async function _selfGet() {
    console.log("====SIAN SECTIONI====");
    console.log("⭕ Get Token...");
    const sianLogin = await LOGIN().then((res) => res.json());
    if (sianLogin.status) {
      let sianToken = await getConfigByGroupName("sianToken");
      if (sianToken) {
        updateConfig(sianToken.id, sianLogin.data.accessToken);
        console.log("🔁 Token Berhasil Diperbarui.");
      } else {
        insertConfig("sianToken", sianLogin.data.accessToken);
        console.log("✅ Token Berhasil Disimpan.");
      }
    } else {
      console.log("❌ Gagal Mendapatkan Token" + sianLogin.message);
      exit(0);
    }

    return sianLogin.token;
  }

  let checkToken = await getConfigByGroupName("sianToken");
  let token;

  if (checkToken) {
    const tokenActiveTime = witaDate().diff(
      moment(checkToken.created_at, "YYYY-MM-DD HH:mm:ss"),
      "minutes"
    );
    if (tokenActiveTime > 110) {
      token = await _selfGet();
    }
    token = checkToken.value;
  } else {
    token = await _selfGet();
  }

  return token;
}

export const GET_POLI = async () => {
  try {
    const layanan = await fetch(`${API_BASE}/ruang-layanan`, {
      method: "GET",
      headers: { ...HEADERS, "X-Token": await GET_SIAN_TOKEN() },
    });

    if (!layanan.ok) throw new Error("Get Layanan request failed");
    return await layanan.json();
  } catch (err) {
    console.error("Error fetching layanan:", err);
    exit(0);
  }
};

export const FETCH_NIK_SIAN = async (nik) => {
  console.log("🔍 Fetching Data by NIK from SIAN...");
  return await fetch(`${API_BASE}/pasien/nik/${nik}`, {
    method: "GET",
    headers: {
      ...HEADERS,
      "X-Token": await GET_SIAN_TOKEN(),
      Referer: "https://sian.medikaconnect.site",
    },
  });
};

export const ruangByAge = [
  {
    id_ruang: "5ff68207-103d-4dc3-bf91-013776156b63",
    antrean_poli: "POLI KIA",
    age: {
      min: "~",
      max: "~",
    },
  },
  {
    id_ruang: "5ff68207-103d-4dc3-bf91-013776156b63",
    antrean_poli: "POLI KB",
    age: {
      min: "~",
      max: "~",
    },
  },
  {
    id_ruang: "028818a9-4e19-43fa-9f1f-6c11fd122038",
    antrean_poli: "POLI UMUM",
    age: {
      min: 0,
      max: 6,
    },
  },
  {
    id_ruang: "e5c28c51-dd32-4af9-9553-5c2fadfe13ae",
    antrean_poli: "POLI UMUM",
    age: {
      min: 7,
      max: 18,
    },
  },
  {
    id_ruang: "279f5206-a28c-4217-b1b9-156d9701d645",
    antrean_poli: "POLI UMUM",
    age: {
      min: 19,
      max: 59,
    },
  },
  {
    id_ruang: "208b44e8-54ad-4b11-a5c9-11ab6ac2f6d6",
    antrean_poli: "POLI UMUM",
    age: {
      min: 19,
      max: 59,
    },
  },
  {
    id_ruang: "bb581197-0c30-4f2f-9592-d8909cc8b59a",
    antrean_poli: "POLI UMUM",
    age: {
      min: 60,
      max: 999,
    },
  },
  {
    id_ruang: "7d756c96-23cb-439e-b9c8-3b3bd4b5da87",
    antrean_poli: "POLI GIGI & MULUT",
    age: {
      min: "~",
      max: "~",
    },
  },
];

export const SET_POLI = async (born_date, nmPoli) => {
  const patientAge = getAge(born_date);

  let ruangPoli = ruangByAge.filter((ruang) => ruang.antrean_poli === nmPoli);

  if (Number(ruangPoli.length) === 1) {
    ruangPoli = ruangPoli[0];
  } else {
    ruangPoli = ruangPoli.filter(
      (r) => patientAge >= r.age.min && patientAge <= r.age.max
    );
    // console.log("ini ruang Poli ", ruangPoli);
    if (Number(ruangPoli.length) === 2) {
      const rand = await getConfigByGroupName("poliDewasa19");
      ruangPoli = ruangPoli[Number(rand.value)];
      updateConfig(Number(rand.id), Number(rand.value) === 1 ? 0 : 1);
    } else {
      ruangPoli = ruangPoli[0];
    }
  }

  const getPoli = await GET_POLI();

  return getPoli.data.data.find((gp) => gp.id_ruang === ruangPoli.id_ruang);
};

export const GET_ANTREAN_NUMBER = async (nik, id_poliklinik, dokter) => {
  try {
    const response = await fetch(`${API_BASE}/antrean/`, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/json",
        "X-Token": await GET_SIAN_TOKEN(),
      },
      body: JSON.stringify({
        nik,
        kode_faskes: "1070365",
        poli: id_poliklinik,
        dokter,
        screening: "0",
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error ambil antrian:", error);
    throw error;
  }
};

export const PRINT_ANTREAN = async (bodyData) => {
  try {
    await fetch(`http://127.0.0.1:8082/api/print-struk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyData),
    }).then((res) => res.json());
  } catch (error) {
    console.log("X Print Bermasalah");
  }
};

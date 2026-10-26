// npx tsx src/ownership/test-holders.ts
import assert from "node:assert/strict";
import { holderCat, holderKey } from "./holders";

assert.equal(holderKey("GESIT PERKASA, PT"), holderKey("GESIT PERKASA"));
assert.equal(holderKey("PT. ASURANSI JIWA IFG"), "ASURANSI IFG JIWA");
assert.equal(holderKey("SARATOGA INVESTAMA SEDAYA TBK"), "INVESTAMA SARATOGA SEDAYA");
assert.equal(holderKey("PERUSAHAAN PERSEROAN (PERSERO) PT ASABRI"), "ASABRI");
assert.equal(holderKey("MAYBANK SECURITIES PTE. LTD."), "MAYBANK SECURITIES");
assert.equal(holderKey("GAFUR SULISTYO UMAR,IR,MBA"), holderKey("IR GAFUR SULISTYO UMAR MBA"), "urutan kata & gelar");
assert.equal(holderKey("BANK DANAMON INDONESIA Tbk, PT - REGISTRAR"), "BANK DANAMON INDONESIA REGISTRAR");
assert.equal(holderKey("DRS LO KHENG HONG"), holderKey("LO KHENG HONG"));

assert.equal(holderCat("SECURITIES COMPANY", false, "UOB KAY HIAN PRIVATE LIMITED"), "kustodian");
assert.equal(holderCat("PRIVATE BANK", false, "BANK OF SINGAPORE LIMITED"), "kustodian");
assert.equal(holderCat("BANK", true, "BANK DANAMON INDONESIA Tbk, PT - REGISTRAR"), "kustodian");
assert.equal(holderCat("PRIVATE BANK", true, "SARATOGA INVESTAMA SEDAYA TBK"), "korporasi", "lokal 'PRIVATE BANK' = salah tipe");
assert.equal(holderCat("SOVEREIGN WEALTH FUND", false, "GOVERNMENT OF NORWAY"), "pemerintah");
assert.equal(holderCat("STATE OWNED ENTERPRISES", true, "PT TASPEN (PERSERO)"), "pemerintah");
assert.equal(holderCat("CORPORATE", true, "PERUSAHAAN PERSEROAN (PERSERO) PT DANANTARA ASSET MANAGEMENT"), "pemerintah");
assert.equal(holderCat("INSURANCE", true, "DJS KETENAGAKERJAAN PROGRAM JAMINAN HARI TUA"), "institusi");
assert.equal(holderCat(null, true, "REKSA DANA EMCO MANTAP"), "institusi");
assert.equal(holderCat("INDIVIDUAL", true, "PRAJOGO PANGESTU"), "perorangan");
assert.equal(holderCat("CORPORATE", true, "PT ASTRA INTERNATIONAL TBK"), "korporasi");
assert.equal(holderCat(null, true, "AGUS NURSALIM"), "lainnya");
console.log("holders: semua cek lolos");

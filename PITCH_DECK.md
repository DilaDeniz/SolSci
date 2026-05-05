# SolSci — Pitch Deck

> *Bilimin zaman damgası. Blokzincir üzerinde.*

---

## 1. Problem

Her yıl dünya genelinde **2 milyonun üzerinde bilimsel makale** yayımlanıyor.

Ama araştırmacılar şu sorularla boğuşmaya devam ediyor:

| Sorun | Gerçek sonucu |
|---|---|
| "Bu veriyi ben mi ürettim, rakibim mi?" | Yıllarca süren öncelik anlaşmazlıkları |
| Ham veri değiştirilebilir, silinebilir | Geri çekilen makaleler, kariyer yıkımları |
| Yayın öncesi keşifler kayıt altına alınamıyor | Fikir hırsızlığına karşı savunmasızlık |
| Üniversite arşivleri merkezi ve kırılgan | Tek bir kurum kapanırsa veriler yok olur |

**Mevcut çözüm:** Kağıt dergiler, e-posta zinciri, "bana güven."

Bilim 2025'te hâlâ imza yerine *itibar* kullanıyor.

---

## 2. Çözüm — SolSci

**SolSci**, araştırmacıların bilimsel çıktılarını Solana blokzinciri üzerine kaydeden, açık ve izinsiz bir keşif doğrulama protokolüdür.

```
Araştırmacı bir dosya seçer
        ↓
SHA-256 hash cihazda hesaplanır (dosya hiçbir yere gönderilmez)
        ↓
Hash + metadata Solana'ya yazılır
        ↓
Değiştirilemez, zaman damgalı, herkese açık sertifika
```

### Tek cümleyle:
> "Dosyanı yüklemeden, keşfinin sahibi olduğunu kanıtla."

---

## 3. Nasıl Çalışır?

### On-Chain Yapı

Her keşif bir **Program Derived Account (PDA)** olarak saklanır:

```
DiscoveryRecord {
  researcher:        PublicKey   // değiştirilemez yaratıcı
  owner:             PublicKey   // devredilebilir sahip
  file_hash:         [u8; 32]    // SHA-256
  timestamp:         i64         // Unix zaman damgası
  metadata:          String      // JSON — tür, araç, açıklama, ORCID…
  endorsement_count: u32         // hakemlik sayısı
}
```

### 5 Temel İşlem

| İşlem | Ne yapar? |
|---|---|
| `register_discovery` | Keşfi zaman damgasıyla yazar |
| `verify_discovery` | Hash'in zincirde var olduğunu doğrular |
| `endorse_discovery` | Diğer araştırmacılar hakemlik yapar |
| `transfer_discovery` | Sahiplik devredilir (araştırmacı sabit kalır) |
| `close_discovery` | Hesap kapatılır, kira geri alınır |

---

## 4. QVAC — Cihaz Üzeri Yapay Zeka

SolSci'ın içine gömülü **yerel AI asistanı**:

| Özellik | Ne işe yarar? |
|---|---|
| **AI Metadata Önerisi** | Dosyayı okur, `analysis_type` / `tool` / `description` doldurur |
| **Ses → Metin (Whisper)** | Açıklamayı mikrofonla dikte et |
| **OCR** | Görsel veya PDF'ten metin çıkarır, AI'a besler |
| **Çeviri** | Açıklamayı herhangi bir dilden İngilizce'ye çevirir |
| **IPFS Yükleme** | Dosyayı dağıtık depolamaya pinler, URL otomatik doldurulur |
| **Anlamsal Arama** | Feed'de "RNA kanser genomik" gibi doğal dil araması |

> Tüm AI işlemleri **cihazda** çalışır. Verin buluta gitmez.

---

## 5. Kullanım Senaryoları

### 🧬 Araştırmacı
*"Rakibim 3 ay sonra aynı bulguyu yayımladı. Benim kim biliyordu?"*

→ SolSci'da kayıt: 0.001 SOL, 2 saniye. Mahkemede geçerli zaman damgası.

### 🔬 Laboratuvar Direktörü
*"Ekibimin ham verilerinin değiştirilmediğini nasıl kanıtlarım?"*

→ Her veri dosyası için PDA. Hash eşleşiyorsa orijinal.

### 📚 Hakemli Dergi
*"Hakem sürecinde tarafsızlığı nasıl sağlarız?"*

→ Gönderim öncesi kayıt. Kimin ne zaman ürettiği şeffaf.

### 🏛️ Üniversite
*"Araştırmacılarımızın ORCID kimliklerini on-chain nasıl doğrularız?"*

→ Cüzdan imzası = kriptografik kimlik. ORCID iD metadata'ya gömülü.

---

## 6. Pazar

| Segment | Büyüklük |
|---|---|
| Küresel akademik yayıncılık | **28 milyar $** (2024) |
| Araştırma veri yönetimi yazılımı | **4,2 milyar $** |
| Bilimsel veri doğrulama & integriti | hızla büyüyen, henüz tanımsız |

**Hedef kullanıcı:** Dünya genelinde **8 milyonun üzerinde aktif araştırmacı**

İlk odak: yaşam bilimleri (genomik, proteomik, klinik araştırma) — veri bütünlüğü en kritik olan alan.

---

## 7. Neden Solana?

| Kriter | Solana | Ethereum |
|---|---|---|
| İşlem ücreti | **~0.001 $** | 2–50 $ |
| Finalize süresi | **~400 ms** | 12–15 saniye |
| TPS kapasitesi | 65.000+ | ~15 |
| PDA (hesap modeli) | ✅ Yerel destek | ❌ Daha karmaşık |

Araştırmacılar gas ücreti düşünmemeli — bilime odaklanmalı.

---

## 8. Rekabet Analizi

| | SolSci | Zenodo | OSF | NFT tabanlı çözümler |
|---|---|---|---|---|
| Değiştirilemez zaman damgası | ✅ | ❌ | ❌ | ✅ |
| Dosya cihazda kalır | ✅ | ❌ | ❌ | Çeşitli |
| Cüzdan gerektirmez (verify) | ✅ | ✅ | ✅ | ❌ |
| Peer endorsement (on-chain) | ✅ | ❌ | ❌ | ❌ |
| Anlamsal AI arama | ✅ | ❌ | ❌ | ❌ |
| Ücret / kayıt | ~0.001 $ | Ücretsiz | Ücretsiz | 20–100 $ |
| Açık protokol | ✅ | ✅ | ✅ | Çeşitli |

---

## 9. Teknoloji Yığını

```
Solana (Devnet → Mainnet)
  └── Anchor 1.0.2
  └── Program ID: 8cmvWB8SrFvS5fKjsCw4bme9iFVeFCFsbTPKdq9NykbH

Frontend
  └── React + Vite + TypeScript
  └── @solana/wallet-adapter (Phantom, Solflare, Backpack)

QVAC AI (yerel)
  └── Llama 3.2 1B  → metadata önerisi
  └── Whisper       → ses transkripsiyonu
  └── Nomic Embed   → anlamsal arama
  └── Tesseract OCR → görsel metin çıkarma
  └── Helsinki NLP  → çeviri

Depolama
  └── IPFS (Kubo yerel node / Pinata fallback)
  └── ORCID Public API (kimlik çözümleme)
```

---

## 10. Traction (Hackathon kapsamı)

- ✅ Solana devnet'e deploy edildi
- ✅ 12 / 12 anchor testi geçiyor
- ✅ Çalışan frontend (register / verify / feed / endorse / transfer)
- ✅ QVAC: 6 AI özelliği entegre
- ✅ IPFS upload & ORCID çözümleme aktif
- ✅ On-chain hakemlik (endorsement) sistemi

---

## 11. Roadmap

### Q3 2025 — Mainnet Beta
- Mainnet deploy
- Kurumsal ortaklıklar (üniversite pilotları)
- Grant başvuruları (NIH, ERC veri yönetimi fonları)

### Q4 2025 — Ekosistem
- SolSci Explorer — tüm keşiflerin görsel haritası
- Atıf grafiği (citation graph) — keşifler arası bağlantı
- Dergi entegrasyonu API'si

### 2026 — Protokol
- DAO yönetimi
- Token ekonomisi (endorse = stake, itibar puanı)
- Çapraz zincir kimlik köprüsü (DID uyumlu)

---

## 12. Ekip

**[İsim]** — Kurucu  
Araştırma altyapısı / blokzincir geliştirme

*"Bilimin güvenilirlik krizi gerçek. Araçlar değişmek zorunda."*

---

## 13. İstediğimiz

> **Hackathon hedefi:** Protokolün çalışabilirliğini kanıtlamak.

Devnet'te canlı. Herkes bugün bir keşif kaydedebilir.

**Sonraki adım:** Pilot araştırma kurumu ortaklığı + mainnet deploy için tohum finansmanı.

---

## 14. Kapanış

Bilim insanlığın ortak hafızasıdır.

O hafızanın korunması için merkezi bir otoriteye, bir dergiye, bir üniversiteye güvenmek zorunda değiliz.

**SolSci** bunu değiştiriyor — bir hash, bir blok, bir zaman damgası.

---

*solsci.xyz · @SolSciProtocol · devnet: `8cmvWB8SrFvS5fKjsCw4bme9iFVeFCFsbTPKdq9NykbH`*

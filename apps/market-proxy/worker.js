// Daftar kode saham IDX (master universe) untuk market breadth. Perbarui dari data/stocks.js Story Generator
// (apps/story-generator/site/data/stocks.js) bila ada emiten baru.
const MASTER_CODES = new Set(["AADI","AALI","ABBA","ABDA","ABMM","ACES","ACRO","ACST","ADCP","ADES","ADHI","ADMF","ADMG","ADMR","ADRO","AEGS","AGAR","AGII","AGRO","AGRS","AHAP","AIMS","AISA","AKKU","AKPI","AKRA","AKSI","ALDO","ALII","ALKA","ALMI","ALTO","AMAG","AMAN","AMAR","AMFG","AMIN","AMMN","AMMS","AMOR","AMRT","ANDI","ANJT","ANTM","APEX","APIC","APII","APLI","APLN","ARCI","AREA","ARGO","ARII","ARKA","ARKO","ARMY","ARNA","ARTA","ARTI","ARTO","ASBI","ASDM","ASGR","ASHA","ASII","ASJT","ASLC","ASLI","ASMI","ASPI","ASPR","ASRI","ASRM","ASSA","ATAP","ATIC","ATLA","AUTO","AVIA","AWAN","AXIO","AYAM","AYLS","BABP","BABY","BACA","BACH","BAIK","BAJA","BALI","BANK","BAPA","BAPI","BATA","BATR","BAUT","BAYU","BBCA","BBHI","BBKP","BBLD","BBMD","BBNI","BBRI","BBRM","BBSI","BBSS","BBTN","BBYB","BCAP","BCIC","BCIP","BDKR","BDMN","BEBS","BEEF","BEER","BEKS","BELI","BELL","BESS","BEST","BFIN","BGTG","BHAT","BHIT","BIKA","BIKE","BIMA","BINA","BINO","BIPI","BIPP","BIRD","BISI","BJBR","BJTM","BKDP","BKSL","BKSW","BLES","BLOG","BLTA","BLTZ","BLUE","BMAS","BMBL","BMHS","BMRI","BMSR","BMTR","BNBA","BNBR","BNGA","BNII","BNLI","BOAT","BOBA","BOGA","BOLA","BOLT","BOSS","BPFI","BPII","BPTR","BRAM","BREN","BRIS","BRMS","BRNA","BRPT","BRRC","BSBK","BSDE","BSIM","BSML","BSSR","BSWD","BTEK","BTEL","BTON","BTPN","BTPS","BUAH","BUDI","BUKA","BUKK","BULL","BUMI","BUVA","BVIC","BWPT","BYAN","CAKK","CAMP","CANI","CARE","CARS","CASA","CASH","CASS","CBDK","CBMF","CBPE","CBRE","CBUT","CCSI","CDIA","CEKA","CENT","CFIN","CGAS","CHEK","CHEM","CHIP","CINT","CITA","CITY","CLAY","CLEO","CLPI","CMNP","CMNT","CMPP","CMRY","CNKO","CNMA","COAL","COCO","COIN","COWL","CPIN","CPRI","CPRO","CRAB","CRSN","CSAP","CSIS","CSMI","CSRA","CTBN","CTRA","CTTH","CUAN","CYBR","DAAZ","DADA","DART","DATA","DAYA","DCII","DEAL","DEFI","DEPO","DEWA","DEWI","DFAM","DGIK","DGNS","DGWG","DIGI","DILD","DIVA","DKFT","DKHH","DLTA","DMAS","DMMX","DMND","DNAR","DNET","DOID","DOOH","DOSS","DPNS","DPUM","DRMA","DSFI","DSNG","DSSA","DUCK","DUTI","DVLA","DWGL","DYAN","EAST","ECII","EDGE","EKAD","ELIT","ELPI","ELSA","ELTY","EMAS","EMDE","EMMI","EMTK","ENAK","ENRG","ENVY","ENZO","EPAC","EPMT","ERAA","ERAL","ERTX","ESIP","ESSA","ESTA","ESTI","ETWA","EURO","EXCL","FAPA","FAST","FASW","FILM","FIMP","FIRE","FISH","FITT","FLMC","FMII","FOLK","FOOD","FORE","FORU","FPNI","FUJI","FUTR","FWCT","GAMA","GDST","GDYR","GEMA","GEMS","GGRM","GGRP","GHON","GIAA","GJTL","GLOB","GLVA","GMFI","GMTD","GOLD","GOLF","GOLL","GOOD","GOTO","GOTOM","GPRA","GPSO","GRIA","GRPH","GRPM","GSMF","GTBO","GTRA","GTSI","GULA","GUNA","GWSA","GZCO","HADE","HAIS","HAJJ","HALO","HATM","HBAT","HDFA","HDIT","HEAL","HELI","HERO","HEXA","HGII","HILL","HITS","HKMU","HMSP","HOKI","HOME","HOMI","HOPE","HOTL","HRME","HRTA","HRUM","HUMI","HYGN","IATA","IBFN","IBOS","IBST","ICBP","ICON","IDEA","IDPR","IFII","IFSH","IGAR","IIKP","IKAI","IKAN","IKBI","IKPM","IMAS","IMJS","IMPC","INAF","INAI","INCF","INCI","INCO","INDF","INDO","INDR","INDS","INDX","INDY","INET","INKP","INOV","INPC","INPP","INPS","INRU","INTA","INTD","INTP","IOTF","IPAC","IPCC","IPCM","IPOL","IPPE","IPTV","IRRA","IRSX","ISAP","ISAT","ISEA","ISSP","ITIC","ITMA","ITMG","JARR","JAST","JATI","JAWA","JAYA","JECC","JECX","JELI","JGLE","JIHD","JKON","JMAS","JPFA","JRPT","JSKY","JSMR","JSPT","JTPE","KAEF","KAQI","KARW","KAYU","KBAG","KBLI","KBLM","KBLV","KBRI","KDSI","KDTN","KEEN","KEJU","KETR","KIAS","KICI","KIJA","KING","KINO","KIOS","KJEN","KKES","KKGI","KLAS","KLBF","KLIN","KMDS","KMTR","KOBX","KOCI","KOIN","KOKA","KONI","KOPI","KOTA","KPIG","KRAS","KREN","KRYA","KSIX","KUAS","LABA","LABS","LAJU","LAND","LAPD","LCGP","LCKM","LEAD","LFLO","LIFE","LINK","LION","LIVE","LMAS","LMAX","LMPI","LMSH","LOPI","LPCK","LPGI","LPIN","LPKR","LPLI","LPPF","LPPS","LRNA","LSIP","LTLS","LUCK","LUCY","MABA","MAGP","MAHA","MAIN","MANG","MAPA","MAPB","MAPI","MARI","MARK","MASB","MAXI","MAYA","MBAP","MBMA","MBSS","MBTO","MCAS","MCOL","MCOR","MDIA","MDIY","MDKA","MDKI","MDLA","MDLN","MDRN","MEDC","MEDS","MEGA","MEJA","MENN","MERI","MERK","META","MFMI","MGLV","MGNA","MGRO","MHKI","MICE","MIDI","MIKA","MINA","MINE","MIRA","MITI","MKAP","MKNT","MKPI","MKTR","MLBI","MLIA","MLPL","MLPT","MMIX","MMLP","MNCN","MOLI","MORA","MPIX","MPMX","MPOW","MPPA","MPRO","MPXL","MRAT","MREI","MSIE","MSIN","MSJA","MSKY","MSTI","MTDL","MTEL","MTFN","MTLA","MTMH","MTPS","MTRA","MTSM","MTWI","MUTU","MYOH","MYOR","MYTX","NAIK","NANO","NASA","NASI","NATO","NAYZ","NCKL","NELY","NEST","NETV","NFCX","NICE","NICK","NICL","NIKL","NINE","NIRO","NISP","NOBU","NPGF","NRCA","NSSS","NTBK","NUSA","NZIA","OASA","OBAT","OBMD","OCAP","OILS","OKAS","OLIV","OMED","OMRE","OPMS","PACK","PADA","PADI","PALM","PAMG","PANI","PANR","PANS","PART","PBID","PBRX","PBSA","PCAR","PDES","PDPP","PEGE","PEHA","PEVE","PGAS","PGEO","PGJO","PGLI","PGUN","PICO","PIPA","PJAA","PJHB","PKPK","PLAN","PLAS","PLIN","PMJS","PMMP","PMUI","PNBN","PNBS","PNGO","PNIN","PNLF","PNSE","POLA","POLI","POLL","POLU","POLY","POOL","PORT","POSA","POWR","PPGL","PPRE","PPRI","PPRO","PRAY","PRDA","PRDL","PRIM","PSAB","PSAT","PSDN","PSGO","PSKT","PSSI","PTBA","PTDU","PTIS","PTMP","PTMR","PTPP","PTPS","PTPW","PTRO","PTSN","PTSP","PUDP","PURA","PURE","PURI","PWON","PYFA","PZZA","RAAM","RAFI","RAJA","RALS","RANC","RANS","RATU","RBMS","RCCC","RDTX","REAL","RELF","RELI","RGAS","RICY","RIGS","RIMO","RISE","RLCO","RMKE","RMKO","ROCK","RODA","RONY","ROTI","RSCH","RSGK","RUIS","RUNS","SAFE","SAGE","SAME","SAMF","SAPX","SATU","SBAT","SBMA","SCCO","SCMA","SCNP","SCPI","SDMU","SDPC","SDRA","SEMA","SFAN","SGER","SGRO","SHID","SHIP","SICO","SIDO","SILO","SIMA","SIMP","SINI","SIPD","SKBM","SKLT","SKRN","SKYB","SLIS","SMAR","SMBR","SMCB","SMDM","SMDR","SMGA","SMGR","SMIL","SMKL","SMKM","SMLE","SMMA","SMMT","SMRA","SMRU","SMSM","SNLK","SOCI","SOFA","SOHO","SOLA","SONA","SOSS","SOTS","SOUL","SPMA","SPRE","SPTO","SQMI","SRAJ","SRIL","SRSN","SRTG","SSIA","SSMS","SSTM","STAA","STAR","STRK","STTP","SUGI","SULI","SUNI","SUPA","SUPR","SURE","SURI","SWAT","SWID","TALF","TAMA","TAMU","TAPG","TARA","TAXI","TAYS","TBIG","TBLA","TBMS","TCID","TCPI","TDPM","TEBE","TECH","TELE","TFAS","TFCO","TGKA","TGRA","TGUK","TIFA","TINS","TIRA","TIRT","TKIM","TLDN","TLKM","TMAS","TMPO","TNCA","TOBA","TOOL","TOPS","TOSK","TOTL","TOTO","TOWR","TOYS","TPIA","TPMA","TRAM","TRGU","TRIL","TRIM","TRIN","TRIO","TRIS","TRJA","TRON","TRST","TRUE","TRUK","TRUS","TSPC","TUGU","TYRE","UANG","UCID","UDNG","UFOE","ULTJ","UNIC","UNIQ","UNIT","UNSP","UNTD","UNTR","UNVR","URBN","UVCR","VAST","VERN","VICI","VICO","VINS","VISI","VIVA","VKTR","VOKS","VRNA","VTNY","WAPO","WBSA","WEGE","WEHA","WGSH","WICO","WIDI","WIFI","WIIM","WIKA","WINE","WINR","WINS","WIRG","WMPP","WMUU","WOMF","WOOD","WOWS","WSBP","WSKT","WTON","YELO","YOII","YPAS","YULE","YUPI","ZATA","ZBRA","ZINC","ZONE","ZYRX"]);

export default {
  async fetch(request) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const marketParam = url.searchParams.get('market');

    // IDX market data is intentionally split into small requests. Cloudflare
    // Workers Free allows 50 external subrequests per invocation. Each breadth
    // page therefore uses <=40 Yahoo chart calls (ticker list = MASTER_CODES above).
    if (marketParam === 'idx') {
      try {
        const part = (url.searchParams.get('part') || '').toLowerCase();
        const pageSize = Math.min(40, Math.max(10, Number(url.searchParams.get('pageSize') || 40)));
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));

        async function yahooChartQuote(symbol) {
          const yUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/'
            + encodeURIComponent(symbol)
            + '?interval=1d&range=1d&includePrePost=false&events=history';
          const res = await fetch(yUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
              'Accept': 'application/json,text/plain,*/*'
            }
          });
          if (!res.ok) throw new Error('Yahoo chart HTTP ' + res.status);
          const data = await res.json();
          const result = data?.chart?.result?.[0];
          const meta = result?.meta;
          if (!meta) throw new Error('Yahoo chart no meta');

          const quote = result?.indicators?.quote?.[0] || {};
          const volumes = quote.volume || [];
          const closes = quote.close || [];
          const lastClose = [...closes].reverse().find(v => Number.isFinite(Number(v)));
          const lastVolume = [...volumes].reverse().find(v => v != null);
          const price = Number(meta.regularMarketPrice ?? lastClose);
          const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
          const volume = Number(meta.regularMarketVolume ?? lastVolume ?? 0);
          if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) {
            throw new Error('Yahoo chart incomplete price/previous');
          }
          return { symbol, price, prev, volume };
        }

        async function yahooQuotes(symbols, concurrency = 5) {
          const out = [];
          for (let i = 0; i < symbols.length; i += concurrency) {
            const batch = symbols.slice(i, i + concurrency);
            const results = await Promise.all(batch.map(async symbol => {
              try {
                return await yahooChartQuote(symbol);
              } catch (e) {
                return { symbol, error: String(e?.message || e) };
              }
            }));
            out.push(...results);
          }
          return out;
        }

        const sectorDefs = [
          ['Energy', 'IDXENERGY'],
          ['Basic Materials', 'IDXBASIC'],
          ['Industrials', 'IDXINDUST'],
          ['Consumer Non-Cyclicals', 'IDXNONCYC'],
          ['Consumer Cyclicals', 'IDXCYCLIC'],
          ['Healthcare', 'IDXHEALTH'],
          ['Financials', 'IDXFINANCE'],
          ['Properties & Real Estate', 'IDXPROPERT'],
          ['Technology', 'IDXTECHNO'],
          ['Infrastructures', 'IDXINFRA'],
          ['Transportation & Logistics', 'IDXTRANS']
        ];

        // TradingView Scanner + master universe (MASTER_CODES).
        // OPTION A: securities missing from TradingView are treated as
        // Suspended / No Transaction and are NOT counted as Flat.
        // Any TradingView symbol not present in MASTER_CODES is ignored
        // (e.g. ETF / other instruments).
        if (part === 'idx') {

          async function fetchTradingViewPage(start, end) {
            const body = {
              filter: [],
              options: { lang: 'en' },
              symbols: {
                query: { types: [] },
                tickers: []
              },
              columns: ['name', 'close', 'change', 'volume'],
              range: [start, end],
              sort: { sortBy: 'name', sortOrder: 'asc' }
            };

            const r = await fetch('https://scanner.tradingview.com/indonesia/scan', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
                'Accept': 'application/json,text/plain,*/*'
              },
              body: JSON.stringify(body)
            });

            const text = await r.text();
            if (!r.ok) throw new Error('TradingView HTTP ' + r.status + ': ' + text.slice(0, 300));

            return JSON.parse(text);
          }

          const tvRows = [];
          let tvExpected = null;

          for (const start of [0, 500]) {
            const data = await fetchTradingViewPage(start, start + 500);

            if (Number.isFinite(Number(data?.totalCount))) {
              tvExpected = Number(data.totalCount);
            }

            const pageRows = Array.isArray(data?.data) ? data.data : [];

            for (const item of pageRows) {
              if (!item || !Array.isArray(item.d)) continue;
              const d = item.d;
              const rawSymbol = String(item.s || '').toUpperCase();
              const code = rawSymbol.includes(':')
                ? rawSymbol.split(':').pop()
                : rawSymbol;

              if (!code) continue;

              tvRows.push({
                code,
                symbol: rawSymbol,
                name: d[0] ?? null,
                close: d[1] ?? null,
                change: d[2] ?? null,
                volume: d[3] ?? null
              });
            }

            if (pageRows.length < 500) break;
          }

          const tvByCode = new Map();
          for (const row of tvRows) {
            if (!MASTER_CODES.has(row.code)) continue;
            if (!tvByCode.has(row.code)) tvByCode.set(row.code, row);
          }

          let up = 0, flat = 0, down = 0, noTrans = 0, invalid = 0;
          let volume = 0;

          const diagnostics = {
            matched: [],
            missing: [],
            extra: []
          };

          for (const code of MASTER_CODES) {
            const row = tvByCode.get(code);

            if (!row) {
              noTrans++;
              if (diagnostics.missing.length < 100) diagnostics.missing.push(code);
              continue;
            }

            const change = Number(row.change);
            const vol = Number(row.volume);

            if (Number.isFinite(vol)) volume += vol;

            if (!Number.isFinite(change)) {
              invalid++;
              continue;
            }

            // Option A: a zero-volume matched security is also treated as
            // No Transaction, not Flat.
            if (Number.isFinite(vol) && vol === 0) {
              noTrans++;
            } else if (change > 0) {
              up++;
            } else if (change < 0) {
              down++;
            } else {
              flat++;
            }

            if (diagnostics.matched.length < 20) {
              diagnostics.matched.push(row);
            }
          }

          for (const row of tvRows) {
            if (!MASTER_CODES.has(row.code) && diagnostics.extra.length < 100) {
              diagnostics.extra.push(row.code);
            }
          }

          const activeCount = up + flat + down;
          const counted = activeCount + noTrans;

          const detail = url.searchParams.get('detail');
          let detailLists;
          if (detail === 'lists') {
            const upCodes = [], flatCodes = [], downCodes = [], noTransCodes = [];
            for (const code of MASTER_CODES) {
              const row = tvByCode.get(code);
              if (!row) { noTransCodes.push(code); continue; }
              const change = Number(row.change);
              const vol = Number(row.volume);
              if (Number.isFinite(vol) && vol === 0) noTransCodes.push(code);
              else if (!Number.isFinite(change)) {}
              else if (change > 0) upCodes.push(code);
              else if (change < 0) downCodes.push(code);
              else flatCodes.push(code);
            }
            detailLists = { up: upCodes, flat: flatCodes, down: downCodes, noTrans: noTransCodes };
          }

          return new Response(JSON.stringify({
            elapsedMs: Date.now() - startedAt,
            source: 'TradingView Scanner + IDX Master',
            part: 'idx',
            date: new Date().toISOString().slice(0, 10),
            masterUniverse: MASTER_CODES.size,
            tradingViewUniverse: new Set(tvRows.map(x => x.code)).size,
            tradingViewReportedTotal: tvExpected,
            comparison: {
              matched: tvByCode.size,
              missingFromTradingView: MASTER_CODES.size - tvByCode.size,
              extraInTradingView: tvRows.filter(x => !MASTER_CODES.has(x.code)).length
            },
            recordsReceived: tvByCode.size,
            recordsExpected: MASTER_CODES.size,
            complete: counted === MASTER_CODES.size,
            breadth: {
              up,
              flat,
              down,
              noTrans,
              active: activeCount,
              total: counted,
              invalid
            },
            market: {
              volume
            },
            diagnostics,
            ...(detailLists ? { lists: detailLists } : {})
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Summary = IHSG + 11 IDX-IC sector indices. This stays well below
        // the Free-plan subrequest limit and does not depend on the stock CSV.
        if (part === 'summary') {
          // Yahoo v8 reliably exposes ^JKSE, but the current IDX-IC sector
          // indices are not consistently exposed under the IDXENERGY/IDXFINANCE
          // symbols used by other sites. Do not fail the whole summary when those
          // symbols are unavailable. Try Yahoo first, then use the current IDX
          // sector table from Investing.com only as a fallback for the sector rows.
          const yahooSymbols = ['^JKSE', ...sectorDefs.map(x => x[1])];
          const quotes = await yahooQuotes(yahooSymbols, 5);
          const map = new Map(quotes.filter(q => !q.error).map(q => [String(q.symbol).toUpperCase(), q]));
          const ihsgQ = map.get('^JKSE');
          if (!ihsgQ) throw new Error('IHSG ^JKSE tidak ditemukan di Yahoo');

          const ihsgPrice = Number(ihsgQ.price);
          const ihsgPrev = Number(ihsgQ.prev);
          let sectors = [];
          let sectorSource = 'Yahoo Finance';

          for (const [name, symbol] of sectorDefs) {
            const q = map.get(symbol.toUpperCase());
            const price = Number(q?.price);
            const prev = Number(q?.prev);
            if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) continue;
            sectors.push({
              name, symbol,
              changePct: ((price - prev) / prev) * 100,
              price, prevClose: prev
            });
          }

          if (sectors.length < 8) {
            const invRes = await fetch('https://id.investing.com/markets/indonesia', {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
              }
            });
            if (invRes.ok) {
              const html = await invRes.text();
              const text = html
                .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/&amp;/gi, '&')
                .replace(/\s+/g, ' ')
                .trim();

              const invRows = [
                ['Financials', /IDX Finance\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Infrastructures', /IDX Infrastructur\.?\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Healthcare', /IDX Healthcare\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Consumer Cyclicals', /IDX Consumer Cycl\.?\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Industrials', /IDX Industrials\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Technology', /IDX Technology\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Transportation & Logistics', /IDX Transportatio\.?\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Energy', /IDX Energy\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Basic Materials', /IDX Basic Materia\.?\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i],
                ['Consumer Non-Cyclicals', /IDX Consumer Non-\.?\s+([0-9.]+,[0-9]+)\s+([+-]?[0-9.]+,[0-9]+)\s+([+-]?[0-9]+,[0-9]+)%/i]
              ];
              const invSectors = [];
              const toNum = (v) => Number(String(v).replace(/\./g, '').replace(',', '.'));
              for (const [name, re] of invRows) {
                const m = text.match(re);
                if (!m) continue;
                const price = toNum(m[1]);
                const change = toNum(m[2]);
                if (Number.isFinite(price) && Number.isFinite(change)) {
                  const prev = price - change;
                  if (prev > 0) invSectors.push({ name, symbol: name, changePct: change / prev * 100, price, prevClose: prev });
                }
              }
              // Property/Real Estate is not listed in the sector summary on
              // the market page, so fetch its dedicated index page as one extra
              // request when needed.
              if (!invSectors.some(x => x.name === 'Properties & Real Estate')) {
                try {
                  const pr = await fetch('https://id.investing.com/indices/idx-cons.-property---real-estate', {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
                  });
                  if (pr.ok) {
                    const pt = (await pr.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
                    const pm = pt.match(/IDX Property(?:s|\s+&\s+Real Estate)?[\s\S]{0,120}?([0-9.]+,[0-9]+)[\s\S]{0,120}?Penutupan Sebelumnya\s+([0-9.]+,[0-9]+)/i);
                    if (pm) {
                      const price = toNum(pm[1]), prev = toNum(pm[2]);
                      if (Number.isFinite(price) && Number.isFinite(prev) && prev > 0) invSectors.push({ name: 'Properties & Real Estate', symbol: 'IDXPROPERT', changePct: (price - prev) / prev * 100, price, prevClose: prev });
                    }
                  }
                } catch (_) {}
              }
              if (invSectors.length >= 8) { sectors = invSectors; sectorSource = 'Investing.com fallback (IDX-IC)'; }
            }
          }

          return new Response(JSON.stringify({
            elapsedMs: Date.now() - startedAt,
            source: sectorSource === 'Yahoo Finance' ? 'Yahoo Finance' : 'Yahoo Finance + Investing.com fallback',
            sectorSource,
            part: 'summary',
            market: {
              ihsg: { price: ihsgPrice, changePct: ((ihsgPrice - ihsgPrev) / ihsgPrev) * 100 },
              sectors
            }
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Breadth pages: <=40 Yahoo calls, safely under 50.
        const uniqueStocks = [...MASTER_CODES].map(c => c + '.JK');
        if (!uniqueStocks.length) throw new Error('Daftar ticker saham IDX kosong');

        const totalPages = Math.ceil(uniqueStocks.length / pageSize);
        if (page > totalPages) {
          return new Response(JSON.stringify({
            elapsedMs: Date.now() - startedAt,
            source: 'Yahoo Finance',
            page, pageSize, totalPages,
            requested: 0, received: 0,
            breadth: { up: 0, flat: 0, down: 0, noTrans: 0, total: 0, skipped: 0 },
            errors: ['page di luar range']
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const slice = uniqueStocks.slice((page - 1) * pageSize, page * pageSize);
        const quotes = await yahooQuotes(slice, 5);
        let up = 0, flat = 0, down = 0, noTrans = 0, skipped = 0;
        const errors = [];
        for (const q of quotes) {
          if (q.error) {
            errors.push({ symbol: q.symbol, error: q.error });
            skipped++;
            continue;
          }
          const price = Number(q.price);
          const prev = Number(q.prev);
          const volume = Number(q.volume);
          if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) {
            skipped++;
            continue;
          }
          if (Number.isFinite(volume) && volume === 0) noTrans++;
          else if (price > prev) up++;
          else if (price < prev) down++;
          else flat++;
        }

        const total = up + flat + down + noTrans;
        const totalTraded = up + flat + down;
        return new Response(JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          source: 'Yahoo Finance',
          page,
          pageSize,
          totalPages,
          requested: slice.length,
          received: quotes.filter(q => !q.error).length,
          breadth: {
            up, flat, down, noTrans, total, skipped,
            upPct: totalTraded ? up / totalTraded * 100 : null,
            flatPct: totalTraded ? flat / totalTraded * 100 : null,
            downPct: totalTraded ? down / totalTraded * 100 : null,
            noTransPct: total ? noTrans / total * 100 : null
          },
          errors
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({
          elapsedMs: Date.now() - startedAt,
          error: String(e?.message || e),
          source: 'Yahoo Finance'
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const symbolsParam = url.searchParams.get('symbols');
    if (!symbolsParam) {
      return new Response(JSON.stringify({ error: 'missing ?symbols= param' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
    const commoditySymbols = new Set(['TIN_BI', 'COAL_BI', 'NICKEL_BI', 'FCPO_MY']);
    const yahooSymbols = symbols.filter(sym => !commoditySymbols.has(sym));
    const body = {};

    // Yahoo Finance: IHSG, indices, FX, oil, gold
    const yahooResults = await Promise.all(yahooSymbols.map(async sym => {
      try {
        const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
        const res = await fetch(yUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) throw new Error('no meta in response');
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose;
        if (price == null || prevClose == null) throw new Error('incomplete data');
        return [sym, { price, prevClose }];
      } catch (e) {
        return [sym, { error: String(e?.message || e) }];
      }
    }));

    for (const [sym, value] of yahooResults) body[sym] = value;

    async function fetchPageText(pageUrl) {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&#x2C;/gi, ',')
        .replace(/&#44;/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function numberFrom(s) {
      if (!s) return null;
      const n = Number(String(s).replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }

    async function fetchBI(sym, label, slug) {
      try {
        const text = await fetchPageText(`https://markets.businessinsider.com/commodities/${slug}-price`);
        const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Business Insider rendered text normally contains e.g. "Tin Price 54,499".
        const cur = text.match(new RegExp(`${esc}\\s+Price\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)`, 'i'));
        const prev = text.match(/([0-9][0-9,]*(?:\.[0-9]+)?)\s+Prev\.?\s*Close/i);

        const price = numberFrom(cur?.[1]);
        const prevClose = numberFrom(prev?.[1]);
        if (price == null || prevClose == null) {
          throw new Error('could not parse price/prev close');
        }
        body[sym] = { price, prevClose };
      } catch (e) {
        body[sym] = { error: `Business Insider: ${String(e?.message || e)}` };
      }
    }

    async function fetchFCPO() {
      const urls = [
        'https://www.investing.com/commodities/palm-oil',
        'https://id.investing.com/commodities/palm-oil',
        'https://uk.investing.com/commodities/palm-oil'
      ];
      let lastErr;

      for (const u of urls) {
        try {
          const text = await fetchPageText(u);
          const m = text.match(/FCPOc1[\s\S]{0,500}?([0-9][0-9,.]{2,})/i);
          const p = text.match(/Prev\.?\s*Close\s+([0-9][0-9,.]*)/i);
          const price = numberFrom(m?.[1]);
          const prevClose = numberFrom(p?.[1]);
          if (price != null && prevClose != null) {
            body.FCPO_MY = { price, prevClose };
            return;
          }
          throw new Error('could not parse FCPO price/prev close');
        } catch (e) {
          lastErr = e;
        }
      }

      body.FCPO_MY = {
        error: `FCPO Malaysia: ${String(lastErr?.message || lastErr || 'source unavailable')}`
      };
    }

    const jobs = [];
    if (symbols.includes('TIN_BI')) jobs.push(fetchBI('TIN_BI', 'Tin', 'tin'));
    if (symbols.includes('COAL_BI')) jobs.push(fetchBI('COAL_BI', 'Coal', 'coal'));
    if (symbols.includes('NICKEL_BI')) jobs.push(fetchBI('NICKEL_BI', 'Nickel', 'nickel'));
    if (symbols.includes('FCPO_MY')) jobs.push(fetchFCPO());

    await Promise.all(jobs);

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  },
};

import { getDesc, normalizeMaterial } from './helpers';

/**
 * Computes the spare summary data structure used for both display and sync.
 * This logic is shared between App.jsx, SpareSummaryPage, and Modals.
 */
export function computeSpareSummaryData(data, rawSources) {
    if (!data || data.length === 0) return null;
    const { nawaRawData = [], poRawData = [], prRawData = [] } = rawSources;

    const EXCLUDE_STATUS = new Set(["ระหว่างขนส่ง", "เบิกนวนคร", "ขอซื้อขอซ่อม"]);
    const filteredRows = data.filter(row => {
        const sx = (row["StatusX"] || row["StatusCall"] || "").trim();
        const mat = (row["Material"] || "").trim();
        return !EXCLUDE_STATUS.has(sx) && mat !== "";
    });
    if (filteredRows.length === 0) return null;

    const pendingUnitsSet = new Set();
    filteredRows.forEach(row => {
        const unit = (row["ค้างหน่วยงาน"] || "ไม่ระบุ").replace(/Stock\s*/gi, '').trim();
        if (unit) pendingUnitsSet.add(unit);
    });
    const pendingUnits = [...pendingUnitsSet].sort();

    const pivotData = {};
    let totalQuantity = 0;
    filteredRows.forEach(row => {
        const matDesc = row["Material"] + '|' + getDesc(row);
        const pending = (row["ค้างหน่วยงาน"] || "ไม่ระบุ").replace(/Stock\s*/gi, '').trim();
        if (!pivotData[matDesc]) {
            pivotData[matDesc] = { total: 0 };
            pendingUnits.forEach(u => pivotData[matDesc][u] = 0);
        }
        if (pending) {
            pivotData[matDesc].total++;
            pivotData[matDesc][pending]++;
            totalQuantity++;
        }
    });

    const sortedMaterials = Object.keys(pivotData).sort((a, b) => pivotData[b].total - pivotData[a].total);
    const topMaterial = sortedMaterials.length > 0 ? sortedMaterials[0].replace('|', '\t') : '-';

    const prgMap = {};
    const nm = (mat) => String(mat || '').trim().replace(/^0+/, '');

    sortedMaterials.forEach(matDesc => {
        const [material] = matDesc.split('|');
        const matNorm = nm(material);
        let prgVal = '-';
        if (nawaRawData.length > 0) {
            const nMatch = nawaRawData.find(r => nm(r["Material"] || "") === matNorm);
            if (nMatch) {
                const pgKey = Object.keys(nMatch).find(k =>
                    k.trim() === "Purchasing Group" || k.trim() === "Purch. Group" || k.trim() === "PG"
                );
                if (pgKey && nMatch[pgKey]) {
                    const pg = nMatch[pgKey].toString().trim();
                    if (pg === "301") prgVal = "ในประเทศ";
                    else if (pg === "302") prgVal = "ต่างประเทศ";
                    else prgVal = pg;
                }
            }
        }
        prgMap[material] = prgVal;
    });

    const prMap = {};
    if (prRawData.length > 0) {
        prRawData.forEach(r => {
            const matKey = normalizeMaterial(r["Material"] || "");
            if (!matKey) return;
            const req = parseFloat((r["Quantity requested"] || "0").toString().replace(/,/g, '')) || 0;
            const ord = parseFloat((r["Quantity ordered"] || "0").toString().replace(/,/g, '')) || 0;
            const qty = req - ord;
            if (qty > 0) {
                prMap[matKey] = (prMap[matKey] || 0) + qty;
            }
        });
    }

    const poMap = {};
    const poDetailMap = {};
    if (poRawData.length > 0) {
        sortedMaterials.forEach(matDesc => {
            const [material] = matDesc.split('|');
            const matNorm = nm(material);
            const poRecords = poRawData.filter(r => {
                const rMat = nm(r["Material"] || "");
                const qty = parseFloat(String(r["Still to be delivered (qty)"] || "0").replace(/,/g, ''));
                return rMat === matNorm && !isNaN(qty) && qty > 0;
            });

            let totalPo = 0;
            poRecords.forEach(r => {
                const qty = parseFloat(String(r["Still to be delivered (qty)"] || "0").replace(/,/g, ''));
                if (!isNaN(qty)) totalPo += qty;
            });
            poMap[material] = totalPo;

            if (poRecords.length > 0) {
                let closest = poRecords[0];
                let closestDate = null;
                poRecords.forEach(r => {
                    const dateStr = r["Document Date"] || r["Date"] || r["Delivery Date"] || r["Deliv.Date"] || "";
                    let d = null;
                    if (dateStr) {
                        const parts = dateStr.split('/');
                        if (parts.length === 3) {
                            d = new Date(parseInt(parts[2]) < 2000 ? parseInt(parts[2]) + 2000 : parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                        } else {
                            d = new Date(dateStr);
                        }
                    }
                    if (d && !isNaN(d.getTime())) {
                        if (!closestDate || d < closestDate) { closestDate = d; closest = r; }
                    }
                });
                poDetailMap[material] = {
                    delivDate: closest["Document Date"] || closest["Date"] || closest["Delivery Date"] || closest["Deliv.Date"] || "-",
                    poDoc: closest["Purchasing Document"] || closest["Purch.Doc."] || "-",
                    supplier: (closest["Supplier/Supplying Plant"] || "-").trim(),
                    qtyDeliv: closest["Still to be delivered (qty)"] || "-"
                };
            }
        });
    }

    const nawaMap = {};
    if (nawaRawData.length > 0) {
        sortedMaterials.forEach(matDesc => {
            const [material] = matDesc.split('|');
            const matNorm = nm(material);
            const nMatch = nawaRawData.find(r => nm(r["Material"] || "") === matNorm);
            if (nMatch && nMatch["Unrestricted"]) {
                const val = parseFloat(nMatch["Unrestricted"].toString().replace(/,/g, '')) || 0;
                nawaMap[material] = val;
            } else {
                nawaMap[material] = 0;
            }
        });
    }

    const prgOptions = new Set();
    Object.values(prgMap).forEach(v => { if (v && v !== "-") prgOptions.add(v); });

    return {
        filteredRows, sortedMaterials, pivotData, pendingUnits,
        totalQuantity, topMaterial, prgMap, prMap, poMap, poDetailMap, nawaMap,
        prgOptions: [...prgOptions].sort()
    };
}

/**
 * Prepares the payload for Google Sheet synchronization.
 */
export function prepareSyncPayload(computedData) {
    if (!computedData) return [];
    const { sortedMaterials, pivotData, pendingUnits, prgMap, prMap, poMap, poDetailMap, nawaMap } = computedData;

    return sortedMaterials
        .filter(matDesc => {
            const [material] = matDesc.split('|');
            const nawaVal = nawaMap[material] || 0;
            const total = pivotData[matDesc].total;
            // Filter logic: only sync items that need stock (total > nawa)
            return !(total <= nawaVal && nawaVal > 0);
        })
        .map(matDesc => {
            const [material, description] = matDesc.split('|');
            const d = pivotData[matDesc];
            const detail = poDetailMap[material] || {};
            
            const rowObj = {
                Material: material,
                Description: description,
                PRG: prgMap[material] || '-',
                PR: prMap[normalizeMaterial(material)] || 0,
                PO: poMap[material] || 0,
                DeliveryDate: detail.delivDate || '-',
                PODocument: detail.poDoc || '-',
                Supplier: detail.supplier || '-',
                QuantityDeliv: detail.qtyDeliv || 0,
                NawaStock: nawaMap[material] || 0,
                TotalPending: d.total
            };
            
            pendingUnits.forEach(u => {
                rowObj[u] = d[u] || 0;
            });
            
            return rowObj;
        });
}

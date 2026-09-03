import Papa from "papaparse";
import * as XLSX from "xlsx";
import { normalizeHeader, matchHeaderToInternalKey } from "./mappers";
import { ESUSRawRow } from "./types";

export interface ESUSParsedFile {
  headerRowIndex: number;
  headersFound: string[];
  mappedColumns: { [originalColumn: string]: string }; // columnaOriginal -> campoInterno
  unrecognizedColumns: string[];
  rawRows: ESUSRawRow[];
}

// Leitor inteligente de arquivo com detecção de codificação (UTF-8 vs ISO-8859-1)
async function readFileAsText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Tentar UTF-8 primeiro
  const utf8Decoder = new TextDecoder("utf-8", { fatal: false });
  let text = utf8Decoder.decode(arrayBuffer);

  // Se a decodificação em UTF-8 gerar caracteres de substituição '\uFFFD' () ou mojibake ('Ã'), usar ISO-8859-1
  if (text.includes("\uFFFD") || (text.includes("Ã") && (text.includes("Â") || text.includes("Ã§") || text.includes("Ã£")))) {
    try {
      const latinDecoder = new TextDecoder("iso-8859-1");
      const latinText = latinDecoder.decode(arrayBuffer);
      if (!latinText.includes("\uFFFD")) {
        text = latinText;
      }
    } catch (e) {
      // Manter texto utf8 se falhar
    }
  }

  return text;
}

// Função para testar se uma linha é a linha de cabeçalho real do e-SUS APS
function isHeaderRow(rowValues: string[]): boolean {
  if (!rowValues || rowValues.length < 2) return false;
  
  const mappedKeys = rowValues
    .map((v) => matchHeaderToInternalKey(v))
    .filter(Boolean);

  const hasNome = mappedKeys.includes("nome");
  const hasDataNasc = mappedKeys.includes("dataNascimento");
  const hasCPF = mappedKeys.includes("cpf");
  const hasCNS = mappedKeys.includes("cns");

  if (hasNome && (hasDataNasc || hasCPF || hasCNS)) {
    return true;
  }

  return mappedKeys.length >= 3;
}

// Parser principal para arquivos CSV e XLSX
export async function parseESUSFile(file: File): Promise<ESUSParsedFile> {
  const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  if (isExcel) {
    return parseExcelFile(file);
  } else {
    return parseCSVFile(file);
  }
}

// Parser para CSV usando PapaParse sem fusão de colunas por aspas corrompidas do e-SUS
async function parseCSVFile(file: File): Promise<ESUSParsedFile> {
  let text = await readFileAsText(file);
  
  // Remover UTF-8 BOM no início do arquivo se presente
  text = text.replace(/^\uFEFF/, "");

  return new Promise((resolve, reject) => {
    // Determinar delimitador preliminar se contiver ';'
    const firstLines = text.substring(0, 2000);
    const hasSemicolon = (firstLines.match(/;/g) || []).length > (firstLines.match(/,/g) || []).length;
    const delimiter = hasSemicolon ? ";" : "";

    Papa.parse(text, {
      delimiter: delimiter,
      quoteChar: "\0", // Desativa a interpretação de aspas internas que fundem colunas no e-SUS
      skipEmptyLines: "greedy",
      complete: (results) => {
        const rows = results.data as string[][];
        if (!rows || rows.length === 0) {
          reject(new Error("O arquivo CSV está vazio."));
          return;
        }

        // Localizar a linha de cabeçalho real
        let headerRowIndex = 0;
        let foundHeader = false;

        for (let i = 0; i < Math.min(rows.length, 30); i++) {
          if (isHeaderRow(rows[i])) {
            headerRowIndex = i;
            foundHeader = true;
            break;
          }
        }

        if (!foundHeader) {
          headerRowIndex = 0;
        }

        const rawHeaders = (rows[headerRowIndex] || []).map((h) => 
          String(h || "").replace(/^["']+|["']+$|"/g, "").trim()
        );
        const mappedColumns: { [col: string]: string } = {};
        const unrecognizedColumns: string[] = [];

        rawHeaders.forEach((h) => {
          if (!h) return;
          const mappedKey = matchHeaderToInternalKey(h);
          if (mappedKey) {
            mappedColumns[h] = mappedKey;
          } else {
            unrecognizedColumns.push(h);
          }
        });

        // Extrair linhas de dados após o cabeçalho
        const rawRows: ESUSRawRow[] = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const rowData = rows[i];
          if (!rowData || rowData.length === 0) continue;
          
          const rowObj: ESUSRawRow = {};
          rawHeaders.forEach((headerName, colIdx) => {
            if (headerName) {
              const valStr = rowData[colIdx] !== undefined 
                ? String(rowData[colIdx]).replace(/^["']+|["']+$|"/g, "").trim() 
                : "";
              rowObj[headerName] = valStr;
            }
          });

          const hasValues = Object.values(rowObj).some((val) => val && String(val).trim() !== "");
          if (hasValues) {
            rawRows.push(rowObj);
          }
        }

        resolve({
          headerRowIndex: headerRowIndex + 1, // 1-indexed para exibição
          headersFound: rawHeaders.filter(Boolean),
          mappedColumns,
          unrecognizedColumns,
          rawRows,
        });
      },
      error: (err: any) => {
        reject(err);
      },
    });
  });
}

// Parser para Excel (.xlsx) usando Biblioteca XLSX
async function parseExcelFile(file: File): Promise<ESUSParsedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!rows || rows.length === 0) {
    throw new Error("A planilha Excel está vazia.");
  }

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const rowStrArr = (rows[i] || []).map((val) => String(val || ""));
    if (isHeaderRow(rowStrArr)) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = (rows[headerRowIndex] || []).map((h) => 
    String(h || "").replace(/^["']+|["']+$|"/g, "").trim()
  );
  const mappedColumns: { [col: string]: string } = {};
  const unrecognizedColumns: string[] = [];

  rawHeaders.forEach((h) => {
    if (!h) return;
    const mappedKey = matchHeaderToInternalKey(h);
    if (mappedKey) {
      mappedColumns[h] = mappedKey;
    } else {
      unrecognizedColumns.push(h);
    }
  });

  const rawRows: ESUSRawRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const rowData = rows[i];
    if (!rowData || rowData.length === 0) continue;

    const rowObj: ESUSRawRow = {};
    rawHeaders.forEach((headerName, colIdx) => {
      if (headerName) {
        const valStr = rowData[colIdx] !== undefined 
          ? String(rowData[colIdx]).replace(/^["']+|["']+$|"/g, "").trim() 
          : "";
        rowObj[headerName] = valStr;
      }
    });

    const hasValues = Object.values(rowObj).some((val) => val && String(val).trim() !== "");
    if (hasValues) {
      rawRows.push(rowObj);
    }
  }

  return {
    headerRowIndex: headerRowIndex + 1, // 1-indexed
    headersFound: rawHeaders.filter(Boolean),
    mappedColumns,
    unrecognizedColumns,
    rawRows,
  };
}

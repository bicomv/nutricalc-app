/**
 * Parser de Relatórios em PDF do CQBAL (v4.0 / CQBAL Web)
 * Extrai dados bromatológicos e nutrientes calculados para inclusão no Nutricalc.
 */

function cleanNameFromFileName(fileName) {
  if (!fileName) return '';
  let name = fileName.replace(/\.pdf$/i, '');
  if (/^media_\d+$/i.test(name)) return '';
  name = name.replace(/relat[oó]rio/gi, '');
  name = name.replace(/tabela/gi, '');
  name = name.replace(/cqbal/gi, '');
  name = name.replace(/[_\-]+/g, ' ').trim();
  if (name.length >= 3) {
    return name.split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return '';
}

function detectTypeFromName(name) {
  const n = (name || '').toLowerCase();
  if (n.match(/silagem|feno|capim|brachiaria|brizantha|panicum|momba[çc]a|tifton|coastcross|palha|cana|forragem|pasto/)) {
    return 'Volumoso';
  }
  if (n.match(/calc[aá]rio|fosfato|sal|mineral|premix|n[uú]cleo|ur[eé]ia/)) {
    return 'Mineral';
  }
  return 'Concentrado';
}

function parseCQBALText(text, fileName = '') {
  text = text || '';
  const result = {
    categoria: '',
    nomeAlimento: '',
    nomeCientifico: '',
    descricao: '',
    tipo: 'Concentrado',
    nutrientes: {},
    nutrientesCalculados: {},
    alimentoNutricalc: {}
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 0. Confiabilidade do texto: um relatório real do CQBAL sempre contém os
  // cabeçalhos padrão da tabela ("NUTRIENTE"/"MÉDIA"). A ausência de ambos
  // indica texto embaralhado (fonte Type3 sem correspondência de layout, via
  // pdf-parse ou via reconstrução por coordenadas) — nesse caso qualquer
  // "valor" que a regex abaixo encontrar é ruído, não dado real, e quem for
  // combinar este resultado com outra fonte (ex.: OCR) não deve confiar nele.
  const upperText = text.toUpperCase();
  result.lowConfidence = text.length > 0 && !upperText.includes('NUTRIENTE') && !upperText.includes('MEDIA') && !upperText.includes('MÉDIA');

  // 1. Detectar Categoria do CQBAL
  const catMatch = text.match(/(CONCENTRADOS\s+(?:ENERG[EÉ]TICOS|PROT[EÉ]ICOS)|VOLUMOSOS|MINERAIS|MINERAL|SUPLEMENTOS?)/i);
  if (catMatch) {
    result.categoria = catMatch[1].toUpperCase();
    if (result.categoria.includes('VOLUMOSO')) {
      result.tipo = 'Volumoso';
    } else if (result.categoria.includes('MINERAL')) {
      result.tipo = 'Mineral';
    } else {
      result.tipo = 'Concentrado';
    }
  }

  // 2. Extrair Nomes do cabeçalho
  const alimMatch = text.match(/ALIMENTO\s*[:\-]?\s*([^\n\r]+)/i);
  const descMatch = text.match(/DESCRI[ÇC][ÃA]O\s*[:\-]?\s*([^\n\r]+)/i);
  if (alimMatch && alimMatch[1].trim().length > 2) {
    result.nomeAlimento = alimMatch[1].trim();
  }
  if (descMatch && descMatch[1].trim().length > 2) {
    result.descricao = descMatch[1].trim();
  }

  if (!result.nomeAlimento) {
    for (let i = 0; i < lines.length; i++) {
      const lineUpper = lines[i].toUpperCase();
      if (result.categoria && lineUpper.includes(result.categoria)) {
        if (lines[i + 1] && lines[i + 1].length > 2) result.nomeAlimento = lines[i + 1].trim();
        if (lines[i + 2] && lines[i + 2].length > 2) result.nomeCientifico = lines[i + 2].trim();
        if (lines[i + 3] && lines[i + 3].length > 2) result.descricao = lines[i + 3].trim();
        break;
      }
    }
  }

  // 3. Montar nome padrão amigável
  let nomeBase = '';
  if (result.descricao && result.descricao.length > 2 && !result.descricao.includes('---')) {
    nomeBase = result.descricao;
  } else if (result.nomeAlimento && result.nomeAlimento.length > 2) {
    nomeBase = result.nomeAlimento;
  } else {
    const fromFile = cleanNameFromFileName(fileName);
    if (fromFile) {
      nomeBase = fromFile;
    } else {
      nomeBase = 'Alimento CQBAL';
    }
  }

  if (result.tipo === 'Concentrado') {
    result.tipo = detectTypeFromName(nomeBase);
  }

  // Se o nome não tiver indicação CQBAL, anexar
  if (!nomeBase.toUpperCase().includes('CQBAL')) {
    result.nome = `${nomeBase} (CQBAL)`;
  } else {
    result.nome = nomeBase;
  }

  // 4. Lista de todos os nutrientes possíveis do CQBAL
  const allKeys = [
    // Relações e compostos longos primeiro para ordenação por tamanho
    'CNF_CALC_BRCORTE2016', 'CNFvD_BRCORTE2016', 'FDNpd_BRCORTE2016',
    'FDND_BRCORTE2016', 'PBvD_BRCORTE2016', 'EEvD_BRCORTE2016',
    'NDT_BRCORTE2016', 'ED_BRCORTE2016', 'EM_BRCORTE2016',
    'EEDGCm_BRCORTE2010', 'EEDGCv_BRCORTE2010', 'EEDGLm_BRCORTE2010', 'EEDGLv_BRCORTE2010',
    'CNFDGCm_BRCORTE2010', 'CNFDGCv_BRCORTE2010', 'CNFDGLm_BRCORTE2010', 'CNFDGLv_BRCORTE2010',
    'FDNDGCm_BRCORTE2010', 'FDNDGCv_BRCORTE2010', 'FDNDGLm_BRCORTE2010', 'FDNDGLv_BRCORTE2010',
    'PBDGCm_BRCORTE2010', 'PBDGCv_BRCORTE2010', 'PBDGLm_BRCORTE2010', 'PBDGLv_BRCORTE2010',
    'NDTGCm_BRCORTE2010', 'NDTGCv_BRCORTE2010', 'NDTGLm_BRCORTE2010', 'NDTGLv_BRCORTE2010',
    'EED_NRC', 'CNFD_NRC', 'FDNDcp_NRC', 'FDND_NRC', 'PBD_NRC', 'NDTm_NRC', 'EDm_NRC', 'CNFDcp_NRC', 'PBD_NRC',
    'PIDA/MS', 'PIDN/MS', 'PIDA/PB', 'PIDN/PB', 'N-NH3/N', 'PDR/MS', 'PNDR/MS',
    'PDR/PB', 'PNDR/PB', 'SOLP/PB', 'FDNcp', 'FDAcp', 'FDNi', 'FDNc', 'FDNp',
    'LIGNINA', 'CHOSOL', 'AMIDO', 'MO', 'MM', 'EE', 'PB', 'MS', 'FDN', 'FDA', 'CHO', 'CNF',
    'NDT OBS', 'NDT',
    'Ca', 'P', 'Mg', 'K', 'Na', 'S', 'Cu', 'Zn', 'Fe', 'Mn', 'Co', 'I', 'Se', 'Cl'
  ];

  // Ordenar chaves das mais longas para as mais curtas (evita prefixos)
  allKeys.sort((a, b) => b.length - a.length);

  const found = {};
  allKeys.forEach(k => {
    // O '_' é opcional na busca: PDFs Type3 do CQBAL às vezes perdem esse
    // caractere na extração (glyph sem mapeamento), então "NDT_BRCORTE2016"
    // também deve casar com "NDTBRCORTE2016".
    const escaped = k.replace(/[\/\-]/g, '\\$&').replace(/_/g, '_?');
    const valuePattern = '(?:\\s*(?:[:=\\-]\\s*|\\(%\\)\\s*|\\s+)|(?=[0-9]))([0-9]+(?:[.,][0-9]{1,3})?)';
    // Prioriza a chave no início de uma "linha" (texto ou espaço antes dela),
    // que é o caso normal de uma tabela; só se nada for encontrado assim é
    // que aceita a chave colada a um caractere não-letra (colunas sem
    // separador, ex. "...1.3PB28.21..." ou a segunda coluna colada ao "-" da
    // coluna anterior, ex. "Zn63.301-I0.101-"). Nunca aceita precedida por
    // letra, por "_" ou por "/" (separador de chave composta como em
    // "PIDA/MS"), para não confundir a chave "MS" isolada com a que aparece
    // dentro de "PIDA/MS". O "-" NÃO é excluído: nos laudos do CQBAL ele é o
    // valor da coluna "S" (desvio) quando ausente e antecede minerais reais
    // (Ca, Na, Cu, I, Se...), que de outra forma seriam perdidos.
    const strictRe = new RegExp('(?:^|\\s)' + escaped + valuePattern, 'i');
    const looseRe = new RegExp('(?:^|[^A-Za-z_\\/])' + escaped + valuePattern, 'i');
    const m = text.match(strictRe) || text.match(looseRe);
    if (m) {
      // Arredonda para 2 casas: evita que um dígito da coluna seguinte
      // (colado sem separador, comum em PDFs Type3 reconstruídos) vaze
      // para dentro do valor capturado (ex.: "65.761" em vez de "65.76").
      found[k] = Math.round(parseFloat(m[1].replace(',', '.')) * 100) / 100;
    }
  });

  result.nutrientesBrutos = found;
  result.alimentoNutricalc = mapFoundToAlimento(found, result.nome, result.tipo);
  return result;
}

// Converte o mapa de nutrientes brutos (chaves no padrão do CQBAL, ex.: 'MS',
// 'PB', 'NDT OBS', 'P', 'I', 'Mn', 'Ca'...) para o formato do banco do
// Nutricalc. Compartilhado pela extração de texto/OCR e pela importação por
// link (parseCQBALUrl), garantindo o mesmo mapeamento em todos os caminhos.
function mapFoundToAlimento(found, nome, tipo) {
  // NDT: prioriza o "NDT OBS" (observado); só usa os calculados por modelo
  // (BRCORTE/NRC) quando o observado não está disponível.
  let ndtFinal = 0;
  if (found['NDT OBS'] !== undefined) ndtFinal = found['NDT OBS'];
  else if (found['NDT_BRCORTE2016'] !== undefined) ndtFinal = found['NDT_BRCORTE2016'];
  else if (found['NDTm_NRC'] !== undefined) ndtFinal = found['NDTm_NRC'];
  else if (found['NDT_NRC'] !== undefined) ndtFinal = found['NDT_NRC'];
  else if (found['NDTGCv_BRCORTE2010'] !== undefined) ndtFinal = found['NDTGCv_BRCORTE2010'];
  else if (found['NDTGCm_BRCORTE2010'] !== undefined) ndtFinal = found['NDTGCm_BRCORTE2010'];
  else if (found['NDTGLm_BRCORTE2010'] !== undefined) ndtFinal = found['NDTGLm_BRCORTE2010'];
  else if (found['NDT'] !== undefined) ndtFinal = found['NDT'];

  // Degradabilidade Ruminal da PB (dpb, sempre em % da PB — ver campo 'dpb' no
  // Nutricalc). PDR/PB é a medida direta de degradabilidade (frações A+B, a
  // que realmente é degradada no rúmen); PDR/MS é a mesma grandeza em % da MS,
  // convertida aqui para % da PB dividindo por PB. SOLP/PB (proteína
  // "solúvel", fração A apenas) é usada só como último recurso: mede algo
  // relacionado mas MENOR que a degradabilidade real (não inclui a fração B
  // degradável), então nunca deve ter prioridade sobre PDR/PB ou PDR/MS.
  let dpbFinal = 0;
  if (found['PDR/PB'] !== undefined) dpbFinal = found['PDR/PB'];
  else if (found['PDR/MS'] !== undefined && found['PB'] && found['PB'] > 0) {
    dpbFinal = parseFloat(((found['PDR/MS'] / found['PB']) * 100).toFixed(2));
  }
  else if (found['SOLP/PB'] !== undefined) dpbFinal = found['SOLP/PB'];

  // Campos percentuais (0-100). O OCR às vezes perde o ponto decimal (ex.:
  // "8.05" vira "805"), gerando um valor 100x maior — como não passam de 100,
  // isso é detectável e corrigível. Não se aplica a minerais (ppm/valores > 100
  // legítimos), por isso eles entram sem o ajuste.
  const pct = v => (v !== undefined && v > 100) ? v / 100 : (v || 0);

  return {
    name: nome,
    tipo: tipo,
    custoKg: 0,
    ms: pct(found['MS']),
    ndt: pct(ndtFinal),
    pb: pct(found['PB']),
    dpb: pct(dpbFinal),
    ee: pct(found['EE']),
    fdn: pct(found['FDN']),
    fda: pct(found['FDA']),
    mm: pct(found['MM']),
    amido: pct(found['AMIDO']),
    cnf: pct(found['CNF'] || found['CNF_CALC_BRCORTE2016']),
    vita: 0,
    ca: found['Ca'] || 0,
    p: found['P'] || 0,
    mg: found['Mg'] || 0,
    na: found['Na'] || 0,
    k: found['K'] || 0,
    s: found['S'] || 0,
    cu: found['Cu'] || 0,
    zn: found['Zn'] || 0,
    fe: found['Fe'] || 0,
    mn: found['Mn'] || 0,
    i: found['I'] || 0,
    co: found['Co'] || 0,
    se: found['Se'] || 0
  };
}

// Título amigável: "MILHO GRÃO MOÍDO" -> "Milho Grão Moído"
function titleCasePt(s) {
  return String(s || '').toLowerCase().replace(/\b([a-zà-ú])([a-zà-ú]*)/gi,
    (m, a, b) => a.toUpperCase() + b);
}

// Importa um alimento a partir do LINK do relatório do CQBAL
// (https://www.cqbal.com.br/#!/gerarelatorio/?data=<base64 JSON>). O próprio
// link já carrega todos os nutrientes de forma estruturada — muito mais
// confiável que ler o PDF/OCR. Aceita a URL inteira ou só o valor de "data".
function parseCQBALUrl(url) {
  if (!url || typeof url !== 'string') throw new Error('Link vazio.');
  let raw = url.trim();
  const m = raw.match(/[?&#]data=([^&#\s]+)/) || (!/[{}\s]/.test(raw) && !/^https?:/i.test(raw) ? [null, raw] : null);
  if (!m) throw new Error('Link inválido: não encontrei o parâmetro "data=" do relatório do CQBAL.');
  let b64 = decodeURIComponent(m[1]);
  let json;
  try {
    // Os textos acentuados vêm em Latin-1 (ISO-8859-1) dentro do base64.
    json = JSON.parse(Buffer.from(b64, 'base64').toString('latin1'));
  } catch (e) {
    try { json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
    catch (e2) { throw new Error('Não foi possível ler os dados do link (base64/JSON inválido).'); }
  }

  const found = {};
  const add = (key, val) => {
    if (key == null || val == null || val === '' || isNaN(val)) return;
    const k = String(key).trim();
    if (!k || found[k] !== undefined) return;
    found[k] = Math.round(parseFloat(val) * 100) / 100;
  };
  const collect = (arr) => (Array.isArray(arr) ? arr : []).forEach(it => {
    add(it.NUTRIENTE, it.media);
    add(it.NUTRIENTE2, it.media2);
  });
  collect(json.lista);
  collect(json.dadosCalculados);

  const categoria = (json.titulo || '').toUpperCase();
  let tipo = 'Concentrado';
  if (/VOLUMOSO/.test(categoria)) tipo = 'Volumoso';
  else if (/MINERA/.test(categoria)) tipo = 'Mineral';

  const nomeBase = titleCasePt(json.subtitulo3 || json.subtitulo1 || json.subtitulo2 || 'Alimento CQBAL');
  const nome = /cqbal/i.test(nomeBase) ? nomeBase : (nomeBase + ' (CQBAL)');

  const result = {
    categoria,
    nome,
    tipo,
    viaUrl: true,
    lowConfidence: false,
    nutrientesBrutos: found,
    fileName: nome
  };
  result.alimentoNutricalc = mapFoundToAlimento(found, nome, tipo);
  return result;
}

const zlib = require('zlib');

function isType3CQBAL(buf) {
  if (!buf) return false;
  const str = buf.toString('latin1', 0, Math.min(buf.length, 100000));
  return str.includes('/Type3') || str.includes('PScript5.dll') || (str.includes('/CharProcs') && str.includes('/Differences'));
}

// Mapa código-de-caractere -> caractere real, reverso-engenhado a partir das
// fontes Type3 sem ToUnicode que o CQBAL embute nos PDFs exportados pelo
// driver de impressão (PScript5.dll/Distiller). Validado como estável entre
// diferentes relatórios/categorias do CQBAL (a tabela de /Differences da
// fonte de dados é praticamente idêntica em todos os exports observados).
const CQBAL_TYPE3_DIGIT_MAP = {
  77: '0', 71: '1', 78: '2', 76: '3', 72: '4', 68: '5', 67: '6', 70: '7', 73: '8', 75: '9',
  69: '.', 86: '-', 83: '/', 82: '%', 5: ' ',
  65: 'M', 66: 'S', 79: 'P', 80: 'B', 89: 'E', 91: 'F', 84: 'D', 87: 'N', 85: 'A',
  90: 'C', 88: 'H', 74: 'O', 95: 'G', 81: 'I', 99: 'T', 98: 'R', 97: 'V', 96: 'L',
  93: 'Q', 92: 'U', 101: 'X', 100: 'Z',
  23: 'C', 24: 'O', 25: 'N', 26: 'E', 27: 'T', 28: 'R', 29: 'A', 30: 'D', 31: 'S',
  32: 'G', 33: 'E', 34: 'I', 35: 'M', 36: 'I', 37: 'L', 38: 'H', 39: 'O',
  40: ',', 41: ' ', 42: 'G', 43: 'R', 44: 'A', 45: 'O',
  46: 'S', 47: 'E', 48: 'C', 49: 'O'
};

function parseType3PdfString(str) {
  let bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str[i];
    if (c === '\\') {
      let next = str[++i];
      if (next === 'n') bytes.push(10);
      else if (next === 'r') bytes.push(13);
      else if (next === 't') bytes.push(9);
      else if (next === 'b') bytes.push(8);
      else if (next === 'f') bytes.push(12);
      else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0));
      else if (/[0-7]/.test(next)) {
        let oct = next;
        if (/[0-7]/.test(str[i+1])) oct += str[++i];
        if (/[0-7]/.test(str[i+1])) oct += str[++i];
        bytes.push(parseInt(oct, 8));
      }
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return bytes;
}

// Decompacta todos os content streams do PDF que contenham operadores de
// texto (BT...ET) e agrupa os glifos decodificados por "linha" (mesma
// coordenada X inicial do bloco de texto — como o relatório é desenhado
// rotacionado 90°, cada linha visual da tabela vira um agrupamento de X
// fixo com os caracteres posicionados ao longo de Y).
function extractCqbalType3RowItems(buf) {
  let pos = 0, streams = [];
  while (true) {
    let sStart = buf.indexOf('stream', pos);
    if (sStart === -1) break;
    let dStart = sStart + 6;
    if (buf[dStart] === 13 && buf[dStart+1] === 10) dStart += 2;
    else if (buf[dStart] === 10 || buf[dStart] === 13) dStart += 1;
    let sEnd = buf.indexOf('endstream', dStart);
    if (sEnd === -1) break;
    try {
      let un = zlib.inflateSync(buf.slice(dStart, sEnd)).toString('latin1');
      if (un.includes('BT') && un.includes('ET')) streams.push(un);
    } catch(e) {}
    pos = sEnd + 9;
  }

  let rowItems = {};
  for (let s of streams) {
    let btRe = /BT([\s\S]*?)ET/g;
    let m;
    while ((m = btRe.exec(s)) !== null) {
      let blk = m[1];
      let tm = blk.match(/([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+Tm/);
      let startX = tm ? parseFloat(tm[5]) : 0;
      let startY = tm ? parseFloat(tm[6]) : 0;
      // Escala de avanço do texto (equivalente ao tamanho da fonte projetado
      // no eixo de leitura); varia entre blocos (título vs. tabela), por isso
      // é lida da própria matriz Tm em vez de um valor fixo.
      let unitScale = tm ? (Math.abs(parseFloat(tm[2])) || 9.5) : 9.5;
      let rowKey = Math.round(startX);

      let opTokens = blk.match(/(\([^\)]*\)|\[[^\]]*\]|[0-9.\-]+|[a-zA-Z*]+)/g) || [];
      let curY = startY;
      let numStack = [];

      for (let tok of opTokens) {
        if (tok.startsWith('(')) {
          let bytes = parseType3PdfString(tok.slice(1, -1));
          let str = bytes.map(b => CQBAL_TYPE3_DIGIT_MAP[b] !== undefined ? CQBAL_TYPE3_DIGIT_MAP[b] : '').join('');
          if (!rowItems[rowKey]) rowItems[rowKey] = [];
          rowItems[rowKey].push({ y: curY, text: str });
        } else if (tok.startsWith('[')) {
          let items = tok.slice(1, -1).match(/(\([^\)]*\)|[0-9.\-]+)/g) || [];
          for (let it of items) {
            if (it.startsWith('(')) {
              let bytes = parseType3PdfString(it.slice(1, -1));
              let str = bytes.map(b => CQBAL_TYPE3_DIGIT_MAP[b] !== undefined ? CQBAL_TYPE3_DIGIT_MAP[b] : '').join('');
              if (!rowItems[rowKey]) rowItems[rowKey] = [];
              rowItems[rowKey].push({ y: curY, text: str });
            } else {
              let kerning = parseFloat(it);
              if (!isNaN(kerning) && kerning < -2000) {
                curY += (-kerning / 1000) * unitScale;
              }
            }
          }
        } else if (tok === 'TD' || tok === 'Td') {
          let tx = numStack[numStack.length - 2] || 0;
          curY += tx * unitScale;
          numStack = [];
        } else {
          let n = parseFloat(tok);
          if (!isNaN(n)) numStack.push(n);
          else numStack = [];
        }
      }
    }
  }
  return rowItems;
}

// Reconstrói o texto "legível" do relatório a partir dos glifos agrupados por
// linha, para reaproveitar o mesmo parser de regex usado nos PDFs com texto
// normal (parseCQBALText) — em vez de depender de coordenadas fixas por
// nutriente, que variam de layout para layout entre as categorias do CQBAL.
function cqbalType3RowItemsToText(rowItems) {
  const xs = Object.keys(rowItems).map(Number);
  const lines = xs.map(x => {
    const items = rowItems[x].slice().sort((a, b) => a.y - b.y);
    let line = '';
    let lastY = null;
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 20.0) line += ' ';
      line += it.text;
      lastY = it.y;
    }
    return { x, line };
  });
  lines.sort((a, b) => b.x - a.x);
  return lines.map(l => l.line).join('\n');
}

function extractCqbalType3Data(buf, fileName = '') {
  const rowItems = extractCqbalType3RowItems(buf);
  if (!Object.keys(rowItems).length) return null;

  const reconstructedText = cqbalType3RowItemsToText(rowItems);
  if (!reconstructedText || reconstructedText.replace(/[^A-Za-z0-9]/g, '').length < 20) {
    return null;
  }

  const parsed = parseCQBALText(reconstructedText, fileName);
  const alim = parsed.alimentoNutricalc;
  // O texto reconstruído a partir dos glifos nunca contém os cabeçalhos
  // "NUTRIENTE"/"MÉDIA" como substring limpa (mesmo quando os valores saem
  // certos), então o sinal de confiança de parseCQBALText não se aplica
  // aqui. Em vez disso, exige um número mínimo de campos percentuais
  // encontrados: extrações erradas para este layout tendem a "achar" só 1
  // valor solto (falso positivo da regex), enquanto uma extração correta
  // encontra vários campos consistentes de uma vez.
  const coreKeys = ['ms', 'ndt', 'pb', 'ee', 'fdn', 'fda', 'mm', 'cnf', 'amido'];
  const coreFound = alim ? coreKeys.filter(k => alim[k] > 0).length : 0;
  if (coreFound < 3) {
    return null;
  }
  parsed.lowConfidence = false;
  return parsed;
}

async function parseCQBALBuffer(buf, fileName = '') {
  fileName = fileName || 'arquivo.pdf';
  try {
    // 1. Tentar a extração dedicada para PDFs com fontes Type3 sem ToUnicode
    // (relatórios gerados via PScript5.dll/Distiller, comuns no CQBAL). A
    // própria função retorna null rapidamente se o PDF não for desse tipo
    // ou se os campos essenciais não forem encontrados.
    try {
      const type3Result = extractCqbalType3Data(buf, fileName);
      if (type3Result) {
        type3Result.fileName = fileName;
        return type3Result;
      }
    } catch (errType3) {
      console.warn('Tentativa Type3 falhou, tentando parser padrão:', errType3.message);
    }

    // 2. Parser padrão de texto via pdf-parse (parseCQBALText já marca
    // result.lowConfidence quando o texto extraído não parece um relatório
    // real do CQBAL, útil para quem for combinar este resultado com outra
    // fonte, ex. o fallback via OCR em cqbal-ocr.js).
    const pdf = require('pdf-parse');
    const data = await pdf(buf);
    const parsed = parseCQBALText(data ? data.text : '', fileName);
    parsed.fileName = fileName;
    return parsed;
  } catch (err) {
    console.error('Erro ao processar buffer de PDF CQBAL:', err);
    const fallback = parseCQBALText('', fileName);
    fallback.fileName = fileName;
    fallback.warning = 'Texto do PDF não pôde ser extraído diretamente: ' + err.message;
    return fallback;
  }
}

module.exports = {
  parseCQBALText,
  parseCQBALBuffer,
  parseCQBALUrl,
  mapFoundToAlimento,
  extractCqbalType3Data,
  isType3CQBAL,
  cleanNameFromFileName,
  detectTypeFromName
};

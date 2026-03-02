import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const datasetPath = path.resolve(__dirname, '../../../SWCPQ-Features-Aggregated-Dataset-January2025');
const codebookHtmlPath = path.join(datasetPath, 'codebook.html');
const csvPath = path.join(datasetPath, 'data files', 'characters-aggregated-scores.csv');
const outputPath = path.join(__dirname, 'thy_self_characters.json');

// Mapeamento: Quais colunas do CSV (BAPs) representam cada eixo do Big Five
// O código define também se precisa inverter a nota (100 - x) para alinhar à positividade do traço
const oceanMap = {
    O: [
        { id: 'BAP73', invert: true },  // low=open, high=uncreative
        { id: 'BAP132', invert: true }, // low=imaginative, high=practical
        { id: 'BAP29', invert: true }   // low=creative, high=conventional
    ],
    C: [
        { id: 'BAP75', invert: false }, // low=disorganized, high=self-disciplined
        { id: 'BAP32', invert: true },  // low=diligent, high=lazy
        { id: 'BAP15', invert: true }   // low=orderly, high=chaotic
    ],
    E: [
        { id: 'BAP72', invert: true },  // low=extrovert, high=introvert
        { id: 'BAP60', invert: false }, // low=quiet, high=loud
        { id: 'BAP59', invert: true }   // low=gregarious, high=private
    ],
    A: [
        { id: 'BAP84', invert: false }, // low=cruel, high=kind
        { id: 'BAP129', invert: true }, // low=warm, high=cold
        { id: 'BAP337', invert: true }  // low=empath, high=psychopath
    ],
    N: [
        { id: 'BAP74', invert: false }, // low=calm, high=anxious
        { id: 'BAP62', invert: false }, // low=confident, high=insecure
        { id: 'BAP36', invert: true }   // low=moody, high=stable
    ]
};

// 1. Extrair nomes e universos do código HTML com Regex
console.log("Lendo codebook.html para extrair IDs...");
const htmlContent = fs.readFileSync(codebookHtmlPath, 'utf8');
const charMap = {};

// Regex pra pegar: <td>ID</td> \s* <td>Nome</td> \s* <td>Universo</td>
const trRegex = /<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/g;
let match;
while ((match = trRegex.exec(htmlContent)) !== null) {
    const id = match[1].trim();
    const name = match[2].trim().replace(/&apos;/g, "'").replace(/&#xE9;/g, 'é');
    const universe = match[3].trim().replace(/&apos;/g, "'").replace(/&#xE9;/g, 'é');

    // Ignorar o cabeçalho 'ID'
    if (id !== 'ID' && !id.startsWith('<')) {
        charMap[id] = { name, universe };
    }
}

console.log(`Extraídos ${Object.keys(charMap).length} personagens do HTML.`);
console.log("Processando o CSV...");

const processedCharacters = [];

// Função auxiliar para calcular a média de um array de regras
const calculateTrait = (row, traitRules) => {
    let sum = 0;
    let count = 0;

    traitRules.forEach(rule => {
        let rawValue = parseFloat(row[rule.id]);
        if (!isNaN(rawValue)) {
            if (rule.invert) {
                rawValue = 100 - rawValue;
            }
            sum += rawValue;
            count++;
        }
    });

    return count === 0 ? 50 : (sum / count);
};

// O CSV é separado por tab (\t), e a primeira coluna geralmente não tem nome (na primeira linha tem um \t e depois BAP1)
// Vamos manipular isso com o mapHeaders
fs.createReadStream(csvPath)
    .pipe(csv({ separator: '\t', mapHeaders: ({ header, index }) => index === 0 ? 'char_id' : header }))
    .on('data', (row) => {
        const id = row['char_id'];

        // Ignora se não existir no charMap
        if (!charMap[id]) return;

        const charInfo = charMap[id];

        // Monta o objeto limpo apenas com o que o thy.self precisa
        const characterProfile = {
            id: id,
            name: charInfo.name,
            universe: charInfo.universe,
            // Calcula as médias, converte pra escala de 100 (opcional, já está) e arredonda para uma casa decimal
            o_score: parseFloat(calculateTrait(row, oceanMap.O).toFixed(1)),
            c_score: parseFloat(calculateTrait(row, oceanMap.C).toFixed(1)),
            e_score: parseFloat(calculateTrait(row, oceanMap.E).toFixed(1)),
            a_score: parseFloat(calculateTrait(row, oceanMap.A).toFixed(1)),
            n_score: parseFloat(calculateTrait(row, oceanMap.N).toFixed(1))
        };

        processedCharacters.push(characterProfile);
    })
    .on('end', () => {
        // Salva o resultado em um arquivo JSON
        fs.writeFileSync(outputPath, JSON.stringify(processedCharacters, null, 2));

        // Gerar CSV para o Supabase
        const csvOutputPath = path.join(__dirname, 'thy_self_characters.csv');
        if (processedCharacters.length > 0) {
            const headers = Object.keys(processedCharacters[0]);
            const csvContent = [
                headers.join(','), // Cabeçalho
                ...processedCharacters.map(char => {
                    return headers.map(header => {
                        let val = char[header];
                        // Escapar vírgulas no CSV
                        if (typeof val === 'string' && val.includes(',')) {
                            return `"${val}"`;
                        }
                        return val;
                    }).join(',');
                })
            ].join('\n');
            fs.writeFileSync(csvOutputPath, csvContent);
        }

        console.log(`Sucesso! ${processedCharacters.length} personagens foram reduzidos ao formato OCEAN.`);
        console.log(`Arquivo JSON salvo em: ${outputPath}`);
        console.log(`Arquivo CSV salvo em: ${csvOutputPath}`);
    });

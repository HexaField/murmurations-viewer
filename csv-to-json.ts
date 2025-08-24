// converts CSV data to json format

import cli from 'cli'
import * as fs from 'fs'
import Papa from 'papaparse'

// get the CSV file location from the CLI arguments using node cli

cli.enable('status')

const options = cli.parse({
  csv: ['i', 'CSV file to convert', 'file', 'data.csv'],
  output: ['o', 'Output file for json data', 'file', 'data.json']
})

// Function to preprocess CSV to fix common quote issues
function preprocessCsv(csvData: string): string {
  // Remove BOM if present
  csvData = csvData.replace(/^\uFEFF/, '')

  // Fix the specific coordinate issue: "Coordinates: [34.0522" should be "Coordinates: [34.0522]"
  csvData = csvData.replace(/Coordinates: \[34\.0522"/g, 'Coordinates: [34.0522]"')

  // Fix other similar coordinate patterns if they exist
  csvData = csvData.replace(/Coordinates: \[([0-9.-]+)"/g, 'Coordinates: [$1]"')

  return csvData
}

cli.main(async () => {
  try {
    const csvFile = options.csv
    const outputFile = options.output

    cli.status('Reading and preprocessing CSV file...')

    // Read the CSV file
    const csvData = fs.readFileSync(csvFile, 'utf8')

    // Preprocess to fix quote issues
    const cleanedCsvData = preprocessCsv(csvData)

    cli.status('Parsing CSV with Papa Parse...')

    // Use Papa Parse which is more robust for malformed CSV
    const parseResult = Papa.parse(cleanedCsvData, {
      header: true, // First row contains headers
      skipEmptyLines: true, // Skip empty lines
      delimiter: ',', // Use comma as delimiter
      quoteChar: '"', // Use double quotes
      escapeChar: '"', // Escape quotes with double quotes
      transformHeader: (header: string) => header.trim(), // Trim header whitespace
      transform: (value: string) => {
        // Clean up the cell values
        if (typeof value === 'string') {
          return value.trim()
        }
        return value
      }
    })

    if (parseResult.errors.length > 0) {
      cli.error('Parsing errors found:')
      parseResult.errors.forEach((error) => {
        console.error(`Row ${error.row}: ${error.message}`)
      })
    }

    cli.status('Writing JSON file...')

    // Write the JSON output
    fs.writeFileSync(outputFile, JSON.stringify(parseResult.data, null, 2))

    cli.ok(`CSV data successfully converted to JSON and saved to ${outputFile}`)
    cli.info(`Processed ${parseResult.data.length} records`)

    if (parseResult.errors.length > 0) {
      cli.info(`${parseResult.errors.length} parsing errors encountered (see above)`)
    }
  } catch (error) {
    cli.error(`Error: ${error.message}`)
  }
})

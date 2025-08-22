// converts CSV data to json format

import cli from 'cli'
import { readFileSync, writeFileSync } from 'fs'

// get the CSV file location from the CLI arguments using node cli

cli.enable('status')

const options = cli.parse({
  csv: ['i', 'CSV file to convert', 'file', 'data.csv'],
  output: ['o', 'Output file for json data', 'file', 'data.json']
})

cli.main(async () => {
  try {
    const csvFile = options.csv
    const outputFile = options.output

    // read the CSV file
    const csvData = readFileSync(csvFile, 'utf8')

    // convert CSV to JSON
    const lines = csvData.split('\n')
    const headers = lines[0].split(',')
    const jsonData = lines.slice(1).map((line) => {
      const values = line.split(',')
      return headers.reduce((obj, header, index) => {
        const headerTrimmed = header.trim()
        if (!headerTrimmed) return obj // skip empty headers
        obj[headerTrimmed] = values[index].trim()
        // if the value is a number, convert it to a number
        if (!!obj[headerTrimmed] && !isNaN(Number(obj[headerTrimmed]))) {
          obj[headerTrimmed] = Number(obj[headerTrimmed])
        }
        // if the value is a boolean, convert it to a boolean
        if (obj[headerTrimmed] === 'true') {
          obj[headerTrimmed] = true
        } else if (obj[headerTrimmed] === 'false') {
          obj[headerTrimmed] = false
        }
        // if the value is valid JSON, parse it
        try {
          if (
            (obj[headerTrimmed] && obj[headerTrimmed].startsWith('{') && obj[headerTrimmed].endsWith('}')) ||
            (obj[headerTrimmed].startsWith('[') && obj[headerTrimmed].endsWith(']'))
          ) {
            obj[headerTrimmed] = JSON.parse(obj[headerTrimmed])
          }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // do nothing, keep the value as a string
        }
        return obj
      }, {})
    })

    // write the JSON data to the output file
    writeFileSync(outputFile, JSON.stringify(jsonData, null, 2))

    cli.ok(`CSV data successfully converted to JSON and saved to ${outputFile}`)
  } catch (error) {
    cli.error(`Error: ${error.message}`)
  }
})

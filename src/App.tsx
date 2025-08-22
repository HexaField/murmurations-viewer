import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import './App.css'
import type { Organization, Person } from './schemas'

const SchemaOrg = {
  memberOf: 'https://schema.org/memberOf', // person => organization | project => organization
  knows: 'https://schema.org/knows', // person => person
  maintainer: 'https://schema.org/maintainer', // person => project
  softwareRequirement: 'https://schema.org/softwareRequirement' // project => project
}

// https://test-index.murmurations.network/v2/nodes?schema=people_schema-v0.1.0
// https://test-index.murmurations.network/v2/nodes?schema=organizations_schema-v1.0.0

const fetchJSON = async (url: string): Promise<unknown> => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const json = await response.json()
    return json
  } catch (error) {
    console.error('Failed to fetch data:', error)
    throw error
  }
}

const getLinksFromPeopleAndOrgs = (people: Person[], orgs: Organization[]): LinkData[] => {
  const links: LinkData[] = []
  const personMap = new Map(people.map((p) => [p.profile_url, p]))
  const orgMap = new Map(orgs.map((o) => [o.profile_url, o]))
  people.forEach((person) => {
    person.relationships?.forEach((relationship) => {
      if (relationship.predicate_url === SchemaOrg.memberOf) {
        const org = orgMap.get(relationship.object_url)
        if (org) {
          links.push({
            source: person.profile_url as string,
            target: org.profile_url as string,
            type: 'memberOf'
          })
        }
      } else if (relationship.predicate_url === SchemaOrg.knows) {
        const otherPerson = personMap.get(relationship.object_url)
        if (otherPerson) {
          links.push({
            source: person.profile_url as string,
            target: otherPerson.profile_url as string,
            type: 'knows'
          })
        }
      } else if (relationship.predicate_url === SchemaOrg.maintainer) {
        const project = orgMap.get(relationship.object_url)
        if (project) {
          links.push({
            source: person.profile_url as string,
            target: project.profile_url as string,
            type: 'maintainer'
          })
        }
      }
    })
  })
  orgs.forEach((org) => {
    org.relationships?.forEach((relationship) => {
      if (relationship.predicate_url === SchemaOrg.softwareRequirement) {
        const otherOrg = orgMap.get(relationship.object_url)
        if (otherOrg) {
          links.push({
            source: org.profile_url as string,
            target: otherOrg.profile_url as string,
            type: 'softwareRequirement'
          })
        }
      }
    })
  })
  // Ensure unique links
  const uniqueLinks = new Map()
  links.forEach((link) => {
    const key = `${link.source}-${link.target}`
    if (!uniqueLinks.has(key)) {
      uniqueLinks.set(key, link)
    }
  })
  return Array.from(uniqueLinks.values())
}

type NodeData = {
  id: string
  name: string
  type: 'person' | 'organization'
}

type LinkData = {
  source: string
  target: string
  type: 'memberOf' | 'knows' | 'maintainer' | 'softwareRequirement'
}

type GraphData = {
  nodes: NodeData[]
  links: LinkData[]
}

type NetworkSelection = {
  label: string
  value: () => Promise<GraphData>
}

const networks: NetworkSelection[] = [
  {
    label: 'World Wise Web',
    value: async () => {
      const [people, orgs] = (await Promise.all([
        fetchJSON('/files/WWW%20Test%20Data%20-%20Person.json'),
        fetchJSON('/files/WWW%20Test%20Data%20-%20Organization.json')
      ])) as [Person[], Organization[]]
      console.log('Fetched people:', people)
      console.log('Fetched organizations:', orgs)
      return {
        nodes: [
          ...people.map((p) => ({ id: p.profile_url as string, name: p.name, type: 'person' as const })),
          ...orgs.map((o) => ({ id: o.profile_url as string, name: o.name, type: 'organization' as const }))
        ],
        links: getLinksFromPeopleAndOrgs(people, orgs)
      }
    }
  },
  {
    label: 'Murmurations Test Index',
    value: async () => {
      const [{ data: people }, { data: orgs }] = (await Promise.all([
        fetchJSON('https://test-index.murmurations.network/v2/nodes?schema=people_schema-v0.1.0'),
        fetchJSON('https://test-index.murmurations.network/v2/nodes?schema=organizations_schema-v1.0.0')
      ])) as [{ data: Person[] }, { data: Organization[] }]
      console.log('Fetched people:', people)
      console.log('Fetched organizations:', orgs)
      return {
        nodes: [
          ...people.map((p) => ({ id: p.profile_url as string, name: p.name, type: 'person' as const })),
          ...orgs.map((o) => ({ id: o.profile_url as string, name: o.name, type: 'organization' as const }))
        ],
        links: getLinksFromPeopleAndOrgs(people, orgs)
      }
    }
  }
]

function App() {
  const [selectedNetwork, setNetwork] = useSimpleStore(networks[0])
  const [data, setData] = useSimpleStore({ nodes: [], links: [] } as GraphData)
  const [fetching, setFetching] = useSimpleStore(false)

  useEffect(() => {
    const fetchData = async () => {
      setFetching(true)
      const graphData = await selectedNetwork.value()
      if (graphData) {
        setData(graphData)
      }
      setFetching(false)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNetwork.label])

  return (
    <div>
      <h1>Murmurations Viewer - Force Graph (2D)</h1>
      {/** Dropdown */}
      <select
        value={selectedNetwork.label}
        onChange={(e) => {
          const network = networks.find((n) => n.label === e.target.value)
          if (network) {
            setNetwork(network)
          }
        }}
      >
        {networks.map((network) => (
          <option key={network.label} value={network.label}>
            {network.label}
          </option>
        ))}
      </select>
      <h2>Selected Network: {selectedNetwork.label}</h2>
      {/** Loading Indicator */}
      {fetching && <p>Loading data...</p>}
      {/** Data Summary */}
      {!fetching && (
        <p>
          Nodes: {data.nodes.length}, Links: {data.links.length}
        </p>
      )}
      {/** Force Graph */}
      <ForceGraph2D
        graphData={data}
        width={900}
        height={600}
        nodeLabel="name"
        nodeColor={(node) => {
          if (node.type === 'person') return 'blue'
          if (node.type === 'organization') return 'green'
          return 'gray'
        }}
        linkColor={(link) => {
          switch (link.type) {
            case 'memberOf':
              return 'orange'
            case 'knows':
              return 'purple'
            case 'maintainer':
              return 'red'
            case 'softwareRequirement':
              return 'cyan'
            default:
              return 'black'
          }
        }}
      />
    </div>
  )
}

export default App

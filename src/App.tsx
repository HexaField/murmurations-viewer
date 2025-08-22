import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import './App.css'
import { SchemaOrg, type Organization, type Person } from './schemas'

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

const getLinksFromRelationships = (people: Person[], orgs: Organization[]): LinkData[] => {
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

// tags are arbitrary metadata strings, not defined in schema. we just need to create links based on common tags
const getLinksFromTags = (people: Person[], orgs: Organization[]): LinkData[] => {
  const links: LinkData[] = []
  const knownTags = new Map<string, string[]>() // map of tag to list of profile URLs

  people.forEach((person) => {
    person.tags?.forEach((tag) => {
      if (!knownTags.has(tag)) {
        knownTags.set(tag, [])
      }
      knownTags.get(tag)?.push(person.profile_url as string)
    })
  })

  orgs.forEach((org) => {
    org.tags?.forEach((tag) => {
      if (!knownTags.has(tag)) {
        knownTags.set(tag, [])
      }
      knownTags.get(tag)?.push(org.profile_url as string)
    })
  })

  knownTags.forEach((urls) => {
    if (urls.length > 1) {
      for (let i = 0; i < urls.length; i++) {
        for (let j = i + 1; j < urls.length; j++) {
          links.push({
            source: urls[i],
            target: urls[j],
            type: 'tag'
          })
        }
      }
    }
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

type RawData = {
  people: Person[]
  orgs: Organization[]
}

type NetworkSelection = {
  label: string
  value: () => Promise<RawData>
}

const networks: NetworkSelection[] = [
  {
    label: 'World Wise Web',
    value: async () => {
      const [people, orgs] = (await Promise.all([
        fetchJSON('/files/WWW%20Test%20Data%20-%20Person.json'),
        fetchJSON('/files/WWW%20Test%20Data%20-%20Organization.json')
      ])) as [Person[], Organization[]]
      return { people, orgs }
    }
  },
  {
    label: 'Murmurations Test Index',
    value: async () => {
      const [{ data: people }, { data: orgs }] = (await Promise.all([
        fetchJSON('https://test-index.murmurations.network/v2/nodes?schema=people_schema-v0.1.0'),
        fetchJSON('https://test-index.murmurations.network/v2/nodes?schema=organizations_schema-v1.0.0')
      ])) as [{ data: Person[] }, { data: Organization[] }]
      return { people, orgs }
    }
  }
]

type NodeData = {
  id: string
  name: string
  type: 'person' | 'organization'
}

type LinkData = {
  source: string
  target: string
  type: 'memberOf' | 'knows' | 'maintainer' | 'softwareRequirement' | 'tag'
}

type GraphData = {
  nodes: NodeData[]
  links: LinkData[]
}

function App() {
  const [selectedNetwork, setNetwork] = useSimpleStore(networks[0])
  const [data, setData] = useSimpleStore({ nodes: [], links: [] } as GraphData)
  const [rawData, setRawData] = useSimpleStore({ people: [], orgs: [] } as { people: Person[]; orgs: Organization[] })
  const [fetching, setFetching] = useSimpleStore(false)
  const [relationshipType, setRelationshipType] = useSimpleStore<'relationships' | 'tags'>('relationships')
  const [nodeFilter, setNodeFilter] = useSimpleStore<'all' | 'people' | 'orgs'>('all')

  useEffect(() => {
    const fetchData = async () => {
      setFetching(true)
      const response = await selectedNetwork.value()
      if (response) {
        console.log('Fetched data:', response)
        setRawData(response)
      }
      setFetching(false)
    }
    fetchData()
  }, [setRawData, setFetching, selectedNetwork])

  useEffect(() => {
    const people = rawData.people || []
    const orgs = rawData.orgs || []
    if (people.length === 0 && orgs.length === 0) {
      setData({ nodes: [], links: [] })
      return
    }
    const linkFunction = relationshipType === 'relationships' ? getLinksFromRelationships : getLinksFromTags
    const filteredPeople = nodeFilter === 'people' ? people : nodeFilter === 'orgs' ? [] : people
    const filteredOrgs = nodeFilter === 'orgs' ? orgs : nodeFilter === 'people' ? [] : orgs
    setData({
      nodes: [
        ...filteredPeople.map((p) => ({ id: p.profile_url as string, name: p.name, type: 'person' as const })),
        ...filteredOrgs.map((o) => ({ id: o.profile_url as string, name: o.name, type: 'organization' as const }))
      ],
      links: linkFunction(filteredPeople, filteredOrgs)
    })
  }, [nodeFilter, rawData.people, rawData.orgs, relationshipType, setData])

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
      {/** Loading Indicator */}
      {fetching && <p>Loading data...</p>}
      {/** Data Summary */}
      {!fetching && (
        <>
          <p>
            Nodes: {data.nodes.length}, Links: {data.links.length}
          </p>
          <div>
            <label>
              <input
                type="radio"
                value="relationships"
                checked={relationshipType === 'relationships'}
                onChange={() => setRelationshipType('relationships')}
              />
              Relationships
            </label>
            <label>
              <input
                type="radio"
                value="tags"
                checked={relationshipType === 'tags'}
                onChange={() => setRelationshipType('tags')}
              />
              Tags
            </label>
          </div>
          <div>
            <label>
              <input type="radio" value="all" checked={nodeFilter === 'all'} onChange={() => setNodeFilter('all')} />
              All Nodes
            </label>
            <label>
              <input
                type="radio"
                value="people"
                checked={nodeFilter === 'people'}
                onChange={() => setNodeFilter('people')}
              />
              People Only
            </label>
            <label>
              <input type="radio" value="orgs" checked={nodeFilter === 'orgs'} onChange={() => setNodeFilter('orgs')} />
              Organizations Only
            </label>
          </div>
        </>
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

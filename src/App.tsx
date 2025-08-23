import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect } from 'react'
import ForceGraph2D, { type LinkObject } from 'react-force-graph-2d'
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
  done: boolean
}

type NetworkSelection = {
  label: string
  value: (abort: AbortSignal, onData: (data: RawData) => void, onError: (error: Error) => void) => void
}

type MurmurationsPaginationType<T = Person | Organization> = {
  data: T[]
  links: {
    first?: string
    self: string
    next?: string
    prev?: string
    last?: string
  }
  meta: {
    number_of_results: number
    total_pages: number
  }
}

const networks: NetworkSelection[] = [
  {
    label: 'World Wise Web',
    value: async (abort: AbortSignal, callback: (data: RawData) => void, onError: (error: Error) => void) => {
      try {
        const [people, orgs] = (await Promise.all([
          fetchJSON('/files/WWW%20Test%20Data%20-%20Person.json'),
          fetchJSON('/files/WWW%20Test%20Data%20-%20Organization.json')
        ])) as [Person[], Organization[]]
        if (abort.aborted) return
        callback({ people, orgs, done: true })
      } catch (error) {
        if (abort.aborted) return
        onError(error as Error)
      }
    }
  },
  {
    label: 'Murmurations Test Index',
    value: async (abort: AbortSignal, callback: (data: RawData) => void, onError: (error: Error) => void) => {
      const baseURL = 'https://test-index.murmurations.network/v2/nodes'
      const peopleSchemaParam = `people_schema-v0.1.0`
      const orgsSchemaParam = `organizations_schema-v1.0.0`

      const maxPages = 5
      let peoplePage = 1
      let orgsPage = 1

      const fetchPage = async <T = Person | Organization,>(url: string): Promise<MurmurationsPaginationType<T>> => {
        try {
          const response = await fetch(url)
          if (!response.ok) throw new Error('Failed to fetch data')
          return response.json()
        } catch (error) {
          onError(error as Error)
          return {
            data: [],
            links: {
              self: url
            },
            meta: {
              number_of_results: 0,
              total_pages: 0
            }
          }
        }
      }

      // fetch first page to get total pages
      const [peopleResponse, orgsResponse] = await Promise.all([
        fetchPage<Person>(`${baseURL}?schema=${peopleSchemaParam}&page=${peoplePage}`),
        fetchPage<Organization>(`${baseURL}?schema=${orgsSchemaParam}&page=${orgsPage}`)
      ])

      const totalPeoplePages = peopleResponse.meta.total_pages
      const totalOrgsPages = orgsResponse.meta.total_pages

      if (abort.aborted) return

      if (totalOrgsPages === 1 && totalPeoplePages === 1) {
        callback({
          people: peopleResponse.data,
          orgs: orgsResponse.data,
          done: true
        })
        return
      }

      const people: Person[] = []
      const orgs: Organization[] = []
      people.push(...peopleResponse.data)
      orgs.push(...orgsResponse.data)

      callback({
        people: peopleResponse.data,
        orgs: orgsResponse.data,
        done: false
      })

      // fetch remaining pages
      while (
        (peoplePage < totalPeoplePages || orgsPage < totalOrgsPages) &&
        peoplePage < maxPages &&
        orgsPage < maxPages
      ) {
        if (peoplePage < totalPeoplePages) {
          peoplePage++
          const nextPeopleResponse = await fetchPage<Person>(
            `${baseURL}?schema=${peopleSchemaParam}&page=${peoplePage}`
          )
          if (abort.aborted) return
          people.push(...nextPeopleResponse.data)
          callback({ people, orgs, done: false })
        }
        if (orgsPage < totalOrgsPages) {
          orgsPage++
          const nextOrgsResponse = await fetchPage<Organization>(
            `${baseURL}?schema=${orgsSchemaParam}&page=${orgsPage}`
          )
          if (abort.aborted) return
          orgs.push(...nextOrgsResponse.data)
          callback({ people, orgs, done: false })
        }
      }
      callback({ people, orgs, done: true })
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

function SourceOptions(props: {
  network: NetworkSelection
  onSelect: (network: NetworkSelection) => void
  onData: (
    networkLabel: string,
    data: { people: Person[]; orgs: Organization[]; relationshipType: 'relationships' | 'tags' }
  ) => void
}) {
  const [relationshipType, setRelationshipType] = useSimpleStore<'relationships' | 'tags'>('relationships')
  const [data, setData] = useSimpleStore<{ people: Person[]; orgs: Organization[] }>({ people: [], orgs: [] })

  useEffect(() => {
    const abortController = new AbortController()
    props.network.value(
      abortController.signal,
      (response) => {
        if (response) {
          console.log('Fetched data:', response)
          setData(response)
        }
      },
      (err) => {
        console.error('Fetch aborted or failed', err)
        setData({ people: [], orgs: [] })
      }
    )
    return () => {
      abortController.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.network])

  useEffect(() => {
    props.onData(props.network.label, { people: data.people, orgs: data.orgs, relationshipType })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationshipType, data.people, data.orgs])

  return (
    <>
      {/** Dropdown */}
      <select
        value={props.network.label}
        onChange={(e) => {
          const network = networks.find((n) => n.label === e.target.value)
          if (network) {
            props.onSelect(network)
          }
        }}
      >
        {networks.map((network) => (
          <option key={network.label} value={network.label}>
            {network.label}
          </option>
        ))}
      </select>
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
    </>
  )
}

function App() {
  const [data, setData] = useSimpleStore({ nodes: [], links: [] } as GraphData)
  const [sources, setSources] = useSimpleStore<NetworkSelection[]>([...networks])
  const [rawData, setRawData] = useSimpleStore<
    Record<string, { people: Person[]; orgs: Organization[]; relationshipType: 'relationships' | 'tags' }>
  >({})

  const [nodeFilter, setNodeFilter] = useSimpleStore<'all' | 'people' | 'orgs'>('all')

  useEffect(() => {
    const nodes = [] as NodeData[]
    const links = [] as LinkData[]
    for (const source in rawData) {
      const raw = rawData[source]
      const people = raw.people as Person[]
      const orgs = raw.orgs as Organization[]
      const relationshipType = raw.relationshipType
      const linkFunction = relationshipType === 'relationships' ? getLinksFromRelationships : getLinksFromTags
      const filteredPeople = nodeFilter === 'people' ? people : nodeFilter === 'orgs' ? [] : people
      const filteredOrgs = nodeFilter === 'orgs' ? orgs : nodeFilter === 'people' ? [] : orgs
      nodes.push(
        ...filteredPeople.map((p) => ({ id: p.profile_url as string, name: p.name, type: 'person' as const })),
        ...filteredOrgs.map((o) => ({ id: o.profile_url as string, name: o.name, type: 'organization' as const }))
      )
      links.push(...linkFunction(filteredPeople, filteredOrgs))
    }
    setData({
      nodes,
      links
    })
  }, [nodeFilter, rawData, setData])

  return (
    <div>
      <h1>Murmurations Viewer - Force Graph (2D)</h1>
      {/* Add Source Button */}
      <button
        onClick={() => {
          const newSource = networks[0]
          setSources((prev) => [...prev, newSource])
        }}
      >
        Add Source
      </button>
      {/* Row layout for all sources */}
      {/** Source Options */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '10px' }}>
        {sources.map((source, index) => (
          // column layout for each source
          <div key={index} style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
            <SourceOptions
              key={index}
              network={source}
              onSelect={(network) => {
                setSources((prev) => prev.map((s) => (s.label === source.label ? network : s)))
              }}
              onData={(networkLabel, data) => {
                setRawData((prev) => ({ ...prev, [networkLabel]: data }))
              }}
            />
            {/* Remove Source Button */}
            <button
              onClick={() => {
                setSources((prev) => prev.filter((s) => s.label !== source.label))
                setRawData((prev) => {
                  const newData = { ...prev }
                  delete newData[source.label]
                  return newData
                })
              }}
            >
              Remove {source.label}
            </button>
          </div>
        ))}
      </div>
      {/** Display Data Summary */}
      <p>
        Nodes: {data.nodes.length}, Links: {data.links.length}
      </p>
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
        linkLabel={(link: LinkObject<NodeData, LinkData>) => {
          const linkSource = link.source as NodeData
          const linkTarget = link.target as NodeData
          switch (link.type) {
            case 'memberOf':
              return linkSource.name + ' is a member of ' + linkTarget.name
            case 'knows':
              return linkSource.name + ' knows ' + linkTarget.name
            case 'maintainer':
              return linkSource.name + ' is a maintainer of ' + linkTarget.name
            case 'softwareRequirement':
              return linkSource.name + ' has a software requirement of ' + linkTarget.name
            case 'tag':
              return linkSource.name + ' relates to ' + linkTarget.name
            default:
              return 'Unknown Link'
          }
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

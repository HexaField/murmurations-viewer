import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect } from 'react'
import ForceGraph2D, { type LinkObject } from 'react-force-graph-2d'
import './App.css'
import { EditDrawer } from './EditDrawer'
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
  return links
}

// tags are arbitrary metadata strings, not defined in schema. we need to create tag nodes and links to them
const getTagNodesAndLinks = (people: Person[], orgs: Organization[], network: string): { nodes: NodeData[], links: LinkData[] } => {
  const tagNodes: NodeData[] = []
  const links: LinkData[] = []
  const knownTags = new Set<string>()

  // Collect all unique tags
  people.forEach((person) => {
    person.tags?.forEach((tag) => {
      knownTags.add(tag)
    })
  })

  orgs.forEach((org) => {
    org.tags?.forEach((tag) => {
      knownTags.add(tag)
    })
  })

  // Create tag nodes
  knownTags.forEach((tag) => {
    tagNodes.push({
      id: `tag:${tag}`,
      name: tag,
      type: 'tag' as const,
      network: network,
      tag: tag
    })
  })

  // Create links from entities to tags
  people.forEach((person) => {
    person.tags?.forEach((tag) => {
      links.push({
        source: person.profile_url as string,
        target: `tag:${tag}`,
        type: 'tag'
      })
    })
  })

  orgs.forEach((org) => {
    org.tags?.forEach((tag) => {
      links.push({
        source: org.profile_url as string,
        target: `tag:${tag}`,
        type: 'tag'
      })
    })
  })

  return { nodes: tagNodes, links }
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

      const maxPages = 1
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

type NodeData =
  | {
      id: string
      name: string
      type: 'person'
      network: string
      profile: Person
    }
  | {
      id: string
      name: string
      type: 'organization'
      network: string
      profile: Organization
    }
  | {
      id: string
      name: string
      type: 'tag'
      network: string
      tag: string
    }

type LinkData = {
  source: string | NodeData
  target: string | NodeData
  type: 'memberOf' | 'knows' | 'maintainer' | 'softwareRequirement' | 'tag'
  // network: string
}

type GraphData = {
  nodes: NodeData[]
  links: LinkData[]
}

type NetworkDataType = {
  people: Person[]
  orgs: Organization[]
  active: boolean
  editing: boolean
}

function NetworkOptions(props: {
  network: NetworkSelection
  onSelect: (network: NetworkSelection) => void
  onData: (networkLabel: string, data: NetworkDataType) => void
}) {
  const [data, setData] = useSimpleStore<{ people: Person[]; orgs: Organization[] }>({ people: [], orgs: [] })
  const [active, setActive] = useSimpleStore(true)
  const [isEditing, setIsEditing] = useSimpleStore(false)

  const downloadData = (dataArray: Person[] | Organization[], dataType: 'people' | 'organizations') => {
    const dataStr = JSON.stringify(dataArray, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    const exportFileDefaultName = `${props.network.label.replace(/\s+/g, '_')}_${dataType}.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

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
    props.onData(props.network.label, {
      people: data.people,
      orgs: data.orgs,
      active,
      editing: isEditing
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.people, data.orgs, active, isEditing])

  const handleUpdateData = (updatedPeople: Person[], updatedOrgs: Organization[]) => {
    setData({ people: updatedPeople, orgs: updatedOrgs })
    setIsEditing(false)
  }

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
      {/** Active Toggle */}
      <label>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked)
          }}
        />
        Active
      </label>
      {/* Download buttons */}
      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
        <button onClick={() => downloadData(data.people, 'people')} disabled={data.people.length === 0}>
          Download People
        </button>
        <button onClick={() => downloadData(data.orgs, 'organizations')} disabled={data.orgs.length === 0}>
          Download Organizations
        </button>
      </div>

      {/* Edit button */}
      <button onClick={() => setIsEditing(!isEditing)} style={{ marginTop: '10px' }}>
        {isEditing ? 'Close Editor' : 'Edit Network'}
      </button>

      <EditDrawer
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        networkLabel={props.network.label}
        people={data.people}
        organizations={data.orgs}
        onUpdateData={handleUpdateData}
      />
    </>
  )
}

const getLinkKey = (link: LinkObject<NodeData, LinkData>) =>
  `${typeof link.source === 'string' ? link.source : link.source.id}-${link.type}-${typeof link.target === 'string' ? link.target : link.target.id}`

function App() {
  const [data, setData] = useSimpleStore({ nodes: [], links: [] } as GraphData)
  const [sources, setSources] = useSimpleStore<NetworkSelection[]>([...networks])
  const [rawData, setRawData] = useSimpleStore<Record<string, NetworkDataType>>({})

  const [nodeFilter, setNodeFilter] = useSimpleStore<'all' | 'people' | 'orgs' | 'tags'>('all')
  const [showRelationships, setShowRelationships] = useSimpleStore(true)
  const [showTags, setShowTags] = useSimpleStore(true)

  useEffect(() => {
    /** Update nodes whilst preserving existing simulation */
    setData((prevData) => {
      const existingNodeIDs = new Set<string>(prevData.nodes.map((n) => n.id))
      const existingLinksIDs = new Set<string>(prevData.links.map(getLinkKey))

      const seenNodeIDs = new Set<string>()
      const seenLinkIDs = new Set<string>()

      // get all new data
      const newNodesData = [] as NodeData[]
      const newLinksData = [] as LinkData[]

      for (const network in rawData) {
        const raw = rawData[network]
        if (!raw.active) continue
        const people = raw.people as Person[]
        const orgs = raw.orgs as Organization[]
        const filteredPeople = nodeFilter === 'orgs' || nodeFilter === 'tags' ? [] : people
        const filteredOrgs = nodeFilter === 'people' || nodeFilter === 'tags' ? [] : orgs

        // Add person nodes
        for (const person of filteredPeople) {
          seenNodeIDs.add(person.profile_url as string)
          if (!existingNodeIDs.has(person.profile_url as string)) {
            newNodesData.push({
              id: person.profile_url as string,
              name: person.name,
              type: 'person' as const,
              network: network,
              profile: person
            })
          }
        }
        
        // Add organization nodes
        for (const org of filteredOrgs) {
          seenNodeIDs.add(org.profile_url as string)
          if (!existingNodeIDs.has(org.profile_url as string)) {
            newNodesData.push({
              id: org.profile_url as string,
              name: org.name,
              type: 'organization' as const,
              network: network,
              profile: org
            })
          }
        }

        // Add tag nodes and links if tags are enabled
        if (showTags) {
          // Use all people and orgs for tag generation, regardless of node filter
          const tagData = getTagNodesAndLinks(people, orgs, network)
          
          // Filter tag nodes based on nodeFilter
          const filteredTagNodes = nodeFilter === 'tags' || nodeFilter === 'all' ? tagData.nodes : []
          
          // Add tag nodes
          for (const tagNode of filteredTagNodes) {
            seenNodeIDs.add(tagNode.id)
            if (!existingNodeIDs.has(tagNode.id)) {
              newNodesData.push(tagNode)
            }
          }
          
          // Add tag links (only if both source and target nodes are visible)
          for (const link of tagData.links) {
            const sourceVisible = seenNodeIDs.has(link.source as string) || existingNodeIDs.has(link.source as string)
            const targetVisible = seenNodeIDs.has(link.target as string) || existingNodeIDs.has(link.target as string)
            
            if (sourceVisible && targetVisible) {
              const linkKey = getLinkKey(link)
              seenLinkIDs.add(linkKey)
              if (!existingLinksIDs.has(linkKey)) {
                newLinksData.push(link)
              }
            }
          }
        }
      }

      // remove old nodes
      for (let i = prevData.nodes.length - 1; i >= 0; i--) {
        const node = prevData.nodes[i]
        if (!seenNodeIDs.has(node.id)) {
          // this node is not in the new data, remove it
          prevData.nodes.splice(i, 1)
        }
      }

      // add new nodes and links
      prevData.nodes.push(...newNodesData)

      // create links from new nodes
      if (showRelationships) {
        const newLinksFromRelationships = getLinksFromRelationships(
          prevData.nodes.filter((n) => n.type === 'person').map((n) => n.profile),
          prevData.nodes.filter((n) => n.type === 'organization').map((n) => n.profile)
        )
        for (const link of newLinksFromRelationships) {
          const linkKey = getLinkKey(link)
          seenLinkIDs.add(linkKey)
          if (!existingLinksIDs.has(linkKey)) {
            newLinksData.push(link)
          }
        }
      }

      // create links from filtered people and orgs
      // remove old links
      for (let i = prevData.links.length - 1; i >= 0; i--) {
        const link = prevData.links[i]
        const linkKey = getLinkKey(link)
        if (!seenLinkIDs.has(linkKey)) {
          // this link is not in the new data, remove it
          prevData.links.splice(i, 1)
        }
      }

      prevData.links.push(...newLinksData)

      let lastLinkIndex =
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        prevData.links.find((l) => typeof l.source !== 'string' && typeof l.target !== 'string')?.index ?? 0

      for (const link of prevData.links) {
        // ensure source and target are NodeData objects, and add index and __controlPoints if missing to fix bug in force-graph
        if (typeof link.source === 'string') {
          const sourceNode = prevData.nodes.find((n) => n.id === link.source)
          const targetNode = prevData.nodes.find((n) => n.id === link.target)

          link.source = sourceNode!
          link.target = targetNode!
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          link.index = lastLinkIndex++
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          link.__controlPoints = null
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          link.__indexColor = '#a8001e'
        }
      }

      // return prevData
      return {
        nodes: prevData.nodes,
        links: prevData.links
      }
    })
  }, [nodeFilter, rawData, setData, showRelationships, showTags])

  const editActive = Object.values(rawData).some((source) => source.editing)

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
        {sources.map((source) => (
          // column layout for each source
          <div key={source.label} style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
            <NetworkOptions
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
        <label>
          <input type="radio" value="tags" checked={nodeFilter === 'tags'} onChange={() => setNodeFilter('tags')} />
          Tags Only
        </label>
      </div>
      <div>
        <label>
          <input type="checkbox" checked={showRelationships} onChange={(e) => setShowRelationships(e.target.checked)} />
          Show Relationships
        </label>
        <label>
          <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} />
          Show Tags
        </label>
      </div>
      {/** Force Graph */}
      <ForceGraph2D
        graphData={data}
        width={900}
        height={600}
        nodeLabel={(node: NodeData) => {
          if (editActive && !rawData[node.network].editing) return ''
          return node.name
        }}
        nodeColor={(node) => {
          // if an edit is active and it's not this node's source, return lightgray
          if (editActive && !rawData[node.network].editing) return 'lightgray'
          if (node.type === 'person') return 'blue'
          if (node.type === 'organization') return 'green'
          if (node.type === 'tag') return 'orange'
          return 'gray'
        }}
        nodeVal={(node) => {
          // Make tag nodes smaller than regular nodes
          if (node.type === 'tag') return 3
          return 6
        }}
        linkLabel={(link: LinkObject<NodeData>) => {
          const linkSource = link.source as NodeData
          const linkTarget = link.target as NodeData
          if ((editActive && rawData[linkSource.network]?.editing) || rawData[linkTarget.network]?.editing) return ''
          switch (link.type) {
            case 'memberOf':
              return linkSource.name + ' is a member of ' + linkTarget.name
            case 'knows':
              return linkSource.name + ' knows ' + linkTarget.name
            case 'maintainer':
              return linkSource.name + ' is a maintainer of ' + linkTarget.name
            case 'softwareRequirement':
              return linkSource.name + ' has a software requirement of ' + linkTarget.name
            case 'tag': {
              const tagNode = linkTarget.type === 'tag' ? linkTarget : linkSource
              const entityNode = linkTarget.type === 'tag' ? linkSource : linkTarget
              return entityNode.name + ' is tagged with ' + tagNode.name
            }
            default:
              return 'Unknown Link'
          }
        }}
        linkColor={(link) => {
          const linkSource = link.source as NodeData
          const linkTarget = link.target as NodeData
          if ((editActive && rawData[linkSource.network]?.editing) || rawData[linkTarget.network]?.editing)
            return 'lightgray'
          switch (link.type) {
            case 'memberOf':
              return 'orange'
            case 'knows':
              return 'purple'
            case 'maintainer':
              return 'red'
            case 'softwareRequirement':
              return 'cyan'
            case 'tag':
              return 'orange'
            default:
              return 'black'
          }
        }}
      />
    </div>
  )
}

export default App

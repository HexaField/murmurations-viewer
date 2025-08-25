import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect } from 'react'
import ForceGraph2D, { type LinkObject } from 'react-force-graph-2d'
import './App.css'
import { EditDrawer } from './EditDrawer'
import { useEnclosingCircles } from './EnclosingCircles'
import { SchemaOrg, type Organization, type Person } from './schemas'
import type { GraphData, LinkData, NetworkDataType, NodeData } from './types'

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
const getTagNodesAndLinks = (
  people: Person[],
  orgs: Organization[],
  network: string
): { nodes: NodeData[]; links: LinkData[] } => {
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
      networks: [network],
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

const flatMurmurationsMap =
  (url: string) => async (abort: AbortSignal, callback: (data: RawData) => void, onError: (error: Error) => void) => {
    try {
      const data = (await fetchJSON(url)) as (Person | Organization)[]
      if (abort.aborted) return
      const people = data.filter((item): item is Person => item.linked_schemas?.includes('people_schema-v0.1.0'))
      const orgs = data.filter((item): item is Organization =>
        item.linked_schemas?.includes('organizations_schema-v1.0.0')
      )
      callback({ people, orgs, done: true })
    } catch (error) {
      if (abort.aborted) return
      onError(error as Error)
    }
  }

type KumuNode = {
  Id: number
  Type: string
  Label: string
  'First Name': string
  'Last Name': string
  Description: string
  Segment: string
  Image: string | null
  'Project Name': string
  'Mailchimp Opt-In': boolean
  'Terms and Conditions': boolean
  'Initial Date': string
  'Last Date': string
  'Creation date': string
  [x: string]: string | number | boolean | null
}

type KumuConnection = {
  Id: number
  From: number
  To: number
  'Name From': string
  'Name To': string
  'Initial Date': string
  'Last Date': string
  Type: string
  Weight: number
  [x: string]: string | number
}

type KumuData = {
  elements: KumuNode[]
  connections: KumuConnection[]
}

// kumu only has people and connections, so we will map all nodes to people and not have organizations
const convertKumuToMurmurations = (data: KumuData, domain: string, tags: string[]) => {
  const people: Person[] = []

  const peopleIdMap = new Map<string, Person>()

  // create profiles
  data.elements.forEach((node) => {
    const person: Person = {
      profile_url: `${domain}/person/${node.Id}`,
      primary_url: `${domain}/person/${node.Id}`,
      name: node.Label,
      description: node.Description || undefined,
      tags: [...tags],
      image: node.Image || undefined,
      relationships: [],
      linked_schemas: []
    }
    peopleIdMap.set(node.Id.toString(), person)
    people.push(person)
  })

  // create relationships
  data.connections.forEach((connection) => {
    try {
      const fromPerson = peopleIdMap.get(connection.From.toString())
      const toPerson = peopleIdMap.get(connection.To.toString())
      if (fromPerson && toPerson) {
        fromPerson.relationships!.push({
          predicate_url: SchemaOrg.knows,
          object_url: toPerson.profile_url as string
        })
      }
    } catch (error) {
      console.error('Error processing connection', connection, error)
    }
  })

  return { people, orgs: [] as Organization[] }
}

const flatKumuMap =
  (url: string, domain: string, tags: string[]) =>
  async (abort: AbortSignal, callback: (data: RawData) => void, onError: (error: Error) => void) => {
    try {
      const data = (await fetchJSON(url)) as KumuData
      if (abort.aborted) return
      const { people, orgs } = convertKumuToMurmurations(data, domain, tags)
      callback({ people, orgs, done: true })
    } catch (error) {
      if (abort.aborted) return
      onError(error as Error)
    }
  }

const networks: NetworkSelection[] = [
  {
    label: 'World Wise Web',
    value: flatMurmurationsMap('/files/WWW%20Test%20Data.json')
  },
  {
    label: 'Limicon 2024',
    value: flatKumuMap('/files/limicon2024.json', 'https://limicon2024.network', ['Limicon 2024'])
  },
  {
    label: 'Limicon 2025',
    value: flatKumuMap('/files/limicon2025.json', 'https://limicon2025.network', ['Limicon 2025'])
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

      // fetch remaining pages
      while (
        (peoplePage < totalPeoplePages || orgsPage < totalOrgsPages) &&
        peoplePage < maxPages &&
        orgsPage < maxPages
      ) {
        callback({ people, orgs, done: false })
        if (peoplePage < totalPeoplePages) {
          peoplePage++
          const nextPeopleResponse = await fetchPage<Person>(
            `${baseURL}?schema=${peopleSchemaParam}&page=${peoplePage}`
          )
          if (abort.aborted) return
          people.push(...nextPeopleResponse.data)
        }
        if (orgsPage < totalOrgsPages) {
          orgsPage++
          const nextOrgsResponse = await fetchPage<Organization>(
            `${baseURL}?schema=${orgsSchemaParam}&page=${orgsPage}`
          )
          if (abort.aborted) return
          orgs.push(...nextOrgsResponse.data)
        }
      }
      callback({ people, orgs, done: true })
    }
  }
]

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
          setData({ people: response.people, orgs: response.orgs })
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
  }, [data, active, isEditing])

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
  const [sources, setSources] = useSimpleStore<NetworkSelection[]>([networks[0], networks[1], networks[2]])
  const [rawData, setRawData] = useSimpleStore<Record<string, NetworkDataType>>({})

  const [nodeFilter, setNodeFilter] = useSimpleStore<'all' | 'people' | 'orgs'>('all')
  const [showRelationships, setShowRelationships] = useSimpleStore(true)
  const [showTags, setShowTags] = useSimpleStore(false)
  const [showCircles, setShowCircles] = useSimpleStore(false)

  useEffect(() => {
    /** Update nodes whilst preserving existing simulation */
    setData((prevData) => {
      const existingNodeIDs = new Set<string>(prevData.nodes.map((n) => n.id))
      const existingLinksIDs = new Set<string>(prevData.links.map(getLinkKey))

      const seenNodeIDs = new Set<string>()
      const seenLinkIDs = new Set<string>()

      const seenNodeNames = new Map<string, Person | Organization>()

      // get all new data
      const newNodesData = [] as NodeData[]
      const newLinksData = [] as LinkData[]

      for (const network in rawData) {
        const raw = rawData[network]
        if (!raw.active) continue
        const people = raw.people as Person[]
        const orgs = raw.orgs as Organization[]
        const filteredPeople = nodeFilter === 'orgs' ? [] : people
        const filteredOrgs = nodeFilter === 'people' ? [] : orgs

        // Add person nodes
        for (const person of filteredPeople) {
          if (seenNodeNames.has(person.name)) {
            // merge network & relationships if duplicate name found
            const existing = seenNodeNames.get(person.name)!
            if (!existing.profile_url && person.profile_url) existing.profile_url = person.profile_url
            if (!existing.primary_url && person.primary_url) existing.primary_url = person.primary_url
            if (!existing.description && person.description) existing.description = person.description
            if (!existing.image && person.image) existing.image = person.image
            if (person.tags) {
              existing.tags = Array.from(new Set([...(existing.tags ?? []), ...person.tags]))
            }
            if (person.relationships) {
              existing.relationships = Array.from(new Set([...(existing.relationships ?? []), ...person.relationships]))
            }
            if (person.linked_schemas) {
              existing.linked_schemas = Array.from(
                new Set([...(existing.linked_schemas ?? []), ...person.linked_schemas])
              )
            }
            continue
          }
          seenNodeIDs.add(person.profile_url as string)
          seenNodeNames.set(person.name, person)
          if (!existingNodeIDs.has(person.profile_url as string)) {
            newNodesData.push({
              id: person.profile_url as string,
              name: person.name,
              type: 'person' as const,
              networks: [network],
              profile: person
            })
          }
        }

        // Add organization nodes
        for (const org of filteredOrgs) {
          seenNodeNames.set(org.name, org)
          seenNodeIDs.add(org.profile_url as string)
          if (!existingNodeIDs.has(org.profile_url as string)) {
            newNodesData.push({
              id: org.profile_url as string,
              name: org.name,
              type: 'organization' as const,
              networks: [network],
              profile: org
            })
          }
        }

        // Add tag nodes and links if tags are enabled
        if (showTags) {
          // Use all people and orgs for tag generation, regardless of node filter
          const tagData = getTagNodesAndLinks(people, orgs, network)

          // Add tag nodes
          for (const tagNode of tagData.nodes) {
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

  const enclosingCircles = useEnclosingCircles(data, showCircles)
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
        <label>
          <input type="checkbox" checked={showCircles} onChange={(e) => setShowCircles(e.target.checked)} />
          Show Enclosing Circles
        </label>
      </div>
      {/** Force Graph */}
      <ForceGraph2D
        graphData={data}
        width={900}
        height={600}
        nodeLabel={(node: NodeData) => {
          if (
            editActive &&
            !Object.entries(rawData).find(([network, data]) => node.networks.includes(network) && data.editing)
          )
            return ''
          return node.name
        }}
        nodeColor={(node) => {
          // if an edit is active and it's not this node's source, return lightgray
          if (
            editActive &&
            !Object.entries(rawData).find(([network, data]) => node.networks.includes(network) && data.editing)
          )
            return 'lightgray'
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
          if (
            editActive &&
            !(
              Object.entries(rawData).find(
                ([network, data]) => linkSource.networks.includes(network) && data.editing
              ) ||
              Object.entries(rawData).find(([network, data]) => linkTarget.networks.includes(network) && data.editing)
            )
          )
            return ''
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
          if (
            editActive &&
            !(
              Object.entries(rawData).find(
                ([network, data]) => linkSource.networks.includes(network) && data.editing
              ) ||
              Object.entries(rawData).find(([network, data]) => linkTarget.networks.includes(network) && data.editing)
            )
          )
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
        {...enclosingCircles}
      />
    </div>
  )
}

export default App

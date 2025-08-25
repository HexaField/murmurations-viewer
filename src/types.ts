import type { Organization, Person } from './schemas'

export type NetworkDataType = {
  people: Person[]
  orgs: Organization[]
  active: boolean
  editing: boolean
}

export type NodeData =
  | {
      id: string
      name: string
      type: 'person'
      networks: string[]
      profile: Person
    }
  | {
      id: string
      name: string
      type: 'organization'
      networks: string[]
      profile: Organization
    }
  | {
      id: string
      name: string
      type: 'tag'
      networks: string[]
      tag: string
    }

export type LinkData = {
  source: string | NodeData
  target: string | NodeData
  type: 'memberOf' | 'knows' | 'maintainer' | 'softwareRequirement' | 'tag'
  // network: string
}

export type GraphData = {
  nodes: NodeData[]
  links: LinkData[]
}

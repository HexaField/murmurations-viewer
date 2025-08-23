import { useSimpleStore } from '@hexafield/simple-store/react'
import { useEffect, useState } from 'react'
import { type Organization, type Person, SchemaOrg } from './schemas'

type EditDrawerProps = {
  isOpen: boolean
  onClose: () => void
  networkLabel: string
  people: Person[]
  organizations: Organization[]
  onUpdateData: (people: Person[], organizations: Organization[]) => void
}

type NodeType = 'person' | 'organization'

type RelationshipFormData = {
  predicate_url: string
  object_url: string
}

type PersonFormData = Partial<Person> & {
  type: 'person'
  name: string
  primary_url: string
  profile_url: string
  tags: string[]
  relationships: RelationshipFormData[]
}

type OrganizationFormData = Partial<Organization> & {
  type: 'organization'
  name: string
  primary_url: string
  profile_url: string
  tags: string[]
  relationships: RelationshipFormData[]
}

type NodeFormData = PersonFormData | OrganizationFormData

const relationshipTypes = [
  { value: SchemaOrg.memberOf, label: 'Member of' },
  { value: SchemaOrg.knows, label: 'Knows' },
  { value: SchemaOrg.maintainer, label: 'Maintainer of' },
  { value: SchemaOrg.softwareRequirement, label: 'Software requirement' }
]

export function EditDrawer({ isOpen, onClose, networkLabel, people, organizations, onUpdateData }: EditDrawerProps) {
  const [editMode, setEditMode] = useSimpleStore<'add' | 'edit'>('add')
  const [selectedNodeId, setSelectedNodeId] = useSimpleStore<string | null>(null)
  const [nodeType, setNodeType] = useSimpleStore<NodeType>('person')

  const [formData, setFormData] = useState<NodeFormData>({
    type: 'person',
    name: '',
    primary_url: '',
    profile_url: '',
    tags: [],
    relationships: [],
    linked_schemas: ['people_schema-v0.1.0']
  } as PersonFormData)

  // Get all entities for relationship targets
  const allEntities = [
    ...people.map((p) => ({ id: p.profile_url as string, name: p.name, type: 'person' as const })),
    ...organizations.map((o) => ({ id: o.profile_url as string, name: o.name, type: 'organization' as const }))
  ]

  // Initialize form when editing existing node
  useEffect(() => {
    if (editMode === 'edit' && selectedNodeId) {
      const person = people.find((p) => p.profile_url === selectedNodeId)
      const organization = organizations.find((o) => o.profile_url === selectedNodeId)

      if (person) {
        setFormData({
          ...person,
          type: 'person',
          tags: person.tags || [],
          relationships:
            person.relationships?.map((r) => ({
              predicate_url: r.predicate_url,
              object_url: r.object_url
            })) || []
        } as PersonFormData)
        setNodeType('person')
      } else if (organization) {
        setFormData({
          ...organization,
          type: 'organization',
          tags: organization.tags || [],
          relationships:
            organization.relationships?.map((r) => ({
              predicate_url: r.predicate_url,
              object_url: r.object_url
            })) || []
        } as OrganizationFormData)
        setNodeType('organization')
      }
    } else {
      // Reset form for adding new node
      setFormData({
        type: nodeType,
        name: '',
        primary_url: '',
        profile_url: '',
        tags: [],
        relationships: [],
        linked_schemas: nodeType === 'person' ? ['people_schema-v0.1.0'] : ['organizations_schema-v1.0.0']
      } as NodeFormData)
    }
  }, [editMode, selectedNodeId, nodeType, people, organizations, setNodeType])

  const handleInputChange = (field: keyof NodeFormData, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleTagsChange = (tagsString: string) => {
    const tags = tagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    handleInputChange('tags', tags)
  }

  const addRelationship = () => {
    setFormData((prev) => ({
      ...prev,
      relationships: [...prev.relationships, { predicate_url: SchemaOrg.knows, object_url: '' }]
    }))
  }

  const updateRelationship = (index: number, field: keyof RelationshipFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      relationships: prev.relationships.map((rel, i) => (i === index ? { ...rel, [field]: value } : rel))
    }))
  }

  const removeRelationship = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      relationships: prev.relationships.filter((_, i) => i !== index)
    }))
  }

  const handleSave = () => {
    if (!formData.name || !formData.primary_url) {
      alert('Name and Primary URL are required')
      return
    }

    const updatedPeople = [...people]
    const updatedOrganizations = [...organizations]

    // Ensure profile_url matches primary_url if not set
    const profileUrl = formData.profile_url || formData.primary_url

    if (formData.type === 'person') {
      const personData: Person = {
        ...formData,
        profile_url: profileUrl,
        linked_schemas: formData.linked_schemas || ['people_schema-v0.1.0'],
        relationships: formData.relationships
          .filter((r) => r.object_url)
          .map((r) => ({
            predicate_url: r.predicate_url,
            object_url: r.object_url
          }))
      }

      if (editMode === 'edit' && selectedNodeId) {
        const index = updatedPeople.findIndex((p) => p.profile_url === selectedNodeId)
        if (index >= 0) {
          updatedPeople[index] = personData
        }
      } else {
        updatedPeople.push(personData)
      }
    } else {
      const orgData: Organization = {
        ...formData,
        profile_url: profileUrl,
        linked_schemas: formData.linked_schemas || ['organizations_schema-v1.0.0'],
        relationships: formData.relationships
          .filter((r) => r.object_url)
          .map((r) => ({
            predicate_url: r.predicate_url,
            object_url: r.object_url
          }))
      }

      if (editMode === 'edit' && selectedNodeId) {
        const index = updatedOrganizations.findIndex((o) => o.profile_url === selectedNodeId)
        if (index >= 0) {
          updatedOrganizations[index] = orgData
        }
      } else {
        updatedOrganizations.push(orgData)
      }
    }

    onUpdateData(updatedPeople, updatedOrganizations)
    onClose()
  }

  const handleDelete = () => {
    if (editMode === 'edit' && selectedNodeId) {
      const updatedPeople = people.filter((p) => p.profile_url !== selectedNodeId)
      const updatedOrganizations = organizations.filter((o) => o.profile_url !== selectedNodeId)
      onUpdateData(updatedPeople, updatedOrganizations)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '400px',
        height: '100vh',
        backgroundColor: 'white',
        border: '1px solid #ccc',
        padding: '20px',
        overflowY: 'auto',
        zIndex: 1000,
        boxShadow: '-2px 0 5px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>Edit {networkLabel}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>
          ×
        </button>
      </div>

      {/* Mode Selection */}
      <div style={{ marginBottom: '20px' }}>
        <label>
          <input
            type="radio"
            checked={editMode === 'add'}
            onChange={() => {
              setEditMode('add')
              setSelectedNodeId(null)
            }}
          />
          Add New Node
        </label>
        <label style={{ marginLeft: '20px' }}>
          <input type="radio" checked={editMode === 'edit'} onChange={() => setEditMode('edit')} />
          Edit Existing Node
        </label>
      </div>

      {/* Node Selection for Edit Mode */}
      {editMode === 'edit' && (
        <div style={{ marginBottom: '20px' }}>
          <label>Select Node to Edit:</label>
          <select
            value={selectedNodeId || ''}
            onChange={(e) => setSelectedNodeId(e.target.value || null)}
            style={{ width: '100%', marginTop: '5px' }}
          >
            <option value="">Choose a node...</option>
            <optgroup label="People">
              {people.map((person) => (
                <option key={person.profile_url as string} value={person.profile_url as string}>
                  {person.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Organizations">
              {organizations.map((org) => (
                <option key={org.profile_url as string} value={org.profile_url as string}>
                  {org.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      {/* Node Type Selection for Add Mode */}
      {editMode === 'add' && (
        <div style={{ marginBottom: '20px' }}>
          <label>Node Type:</label>
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as NodeType)}
            style={{ width: '100%', marginTop: '5px' }}
          >
            <option value="person">Person</option>
            <option value="organization">Organization</option>
          </select>
        </div>
      )}

      {/* Form Fields */}
      <div style={{ marginBottom: '15px' }}>
        <label>Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          style={{ width: '100%', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Primary URL *</label>
        <input
          type="url"
          value={formData.primary_url}
          onChange={(e) => handleInputChange('primary_url', e.target.value)}
          placeholder="https://example.com"
          style={{ width: '100%', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Profile URL (optional, defaults to Primary URL)</label>
        <input
          type="url"
          value={formData.profile_url}
          onChange={(e) => handleInputChange('profile_url', e.target.value)}
          placeholder="https://example.com/profile"
          style={{ width: '100%', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Tags (comma-separated)</label>
        <input
          type="text"
          value={formData.tags.join(', ')}
          onChange={(e) => handleTagsChange(e.target.value)}
          placeholder="tag1, tag2, tag3"
          style={{ width: '100%', marginTop: '5px' }}
        />
      </div>

      {/* Optional fields based on node type */}
      {formData.type === 'person' && (
        <div style={{ marginBottom: '15px' }}>
          <label>Nickname</label>
          <input
            type="text"
            value={(formData as PersonFormData).nickname || ''}
            onChange={(e) => handleInputChange('nickname', e.target.value)}
            style={{ width: '100%', marginTop: '5px' }}
          />
        </div>
      )}

      <div style={{ marginBottom: '15px' }}>
        <label>Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          style={{ width: '100%', marginTop: '5px', minHeight: '60px' }}
        />
      </div>

      {/* Relationships */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label>Relationships</label>
          <button type="button" onClick={addRelationship} style={{ fontSize: '12px' }}>
            + Add Relationship
          </button>
        </div>
        {formData.relationships.map((rel, index) => (
          <div key={index} style={{ border: '1px solid #ddd', padding: '10px', marginTop: '10px' }}>
            <div style={{ marginBottom: '10px' }}>
              <label>Relationship Type:</label>
              <select
                value={rel.predicate_url}
                onChange={(e) => updateRelationship(index, 'predicate_url', e.target.value)}
                style={{ width: '100%', marginTop: '5px' }}
              >
                {relationshipTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Target Entity:</label>
              <select
                value={rel.object_url}
                onChange={(e) => updateRelationship(index, 'object_url', e.target.value)}
                style={{ width: '100%', marginTop: '5px' }}
              >
                <option value="">Choose target...</option>
                {allEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} ({entity.type})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => removeRelationship(index)} style={{ fontSize: '12px', color: 'red' }}>
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {editMode === 'add' ? 'Add Node' : 'Save Changes'}
        </button>
        {editMode === 'edit' && (
          <button
            onClick={handleDelete}
            style={{ padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Delete
          </button>
        )}
        <button
          onClick={onClose}
          style={{ padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

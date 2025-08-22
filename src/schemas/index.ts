import { type FromSchema } from 'json-schema-to-ts'
import organizationsSchema from '../../schemas/organizations_schema-v1.0.0'
import peopleSchema from '../../schemas/people_schema-v0.1.0'

export type Organization = FromSchema<typeof organizationsSchema>

export type Person = FromSchema<typeof peopleSchema>

export type Project = Organization

// const ajv = new Ajv({ allErrors: true, strict: false });

// export const validateOrganization = ajv.compile(organizationsSchema);
// export const validatePerson = ajv.compile(peopleSchema);

export const SchemasMurmurations = {
  organizations: organizationsSchema,
  people: peopleSchema
}

export const SchemaOrg = {
  memberOf: 'https://schema.org/memberOf', // person => organization | project => organization
  knows: 'https://schema.org/knows', // person => person
  maintainer: 'https://schema.org/maintainer', // person => project
  softwareRequirement: 'https://schema.org/softwareRequirement' // project => project
}

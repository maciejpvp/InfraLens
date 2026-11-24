import { Fragment } from 'react'

export const ResourceName = ({ name }: { name: string }) => (
  <>
    {name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).map((part, index) => (
      <Fragment key={index}>
        {index > 0 && <wbr />}
        {part}
      </Fragment>
    ))}
  </>
)

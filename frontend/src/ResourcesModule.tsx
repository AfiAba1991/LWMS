import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from './lib/api'
import type { Page } from './lib/api'
import './facility-actions.css'
import './facility-manager.css'

type Facility = { id: number; name: string }
type Asset = { id: number; identifier: string; status: string }
type Resource = { id: number; name: string; category: string; quantity: number; facility_id: number; assets: Asset[] }
const PAGE_SIZE = 10

export function ResourcesModule() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [facilityId, setFacilityId] = useState('')
  const [editing, setEditing] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState<Resource | null>(null)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [quantity, setQuantity] = useState(1)
  const [identifiers, setIdentifiers] = useState([''])

  const load = async () => {
    setFacilities((await api<Page<Facility>>('/facilities')).data)
    setResources((await api<{ data: Resource[] }>('/facility-resources')).data)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { setPage(1) }, [facilityId, search])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const values = {
      name: data.get('name'),
      category: data.get('category'),
      quantity,
      asset_identifiers: identifiers,
    }
    try {
      await api(editing ? `/facility-resources/${editing.id}` : '/facility-resources', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(editing ? values : { ...values, facility_id: Number(facilityId), properties: {} }),
      })
      setEditing(null)
      setQuantity(1)
      setIdentifiers([''])
      form.reset()
      await load()
      setNotice(editing ? 'Resource updated successfully.' : 'Resource recorded successfully.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save resource')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api(`/facility-resources/${deleting.id}`, { method: 'DELETE' })
      if (editing?.id === deleting.id) setEditing(null)
      setDeleting(null)
      await load()
      setNotice('Resource deleted successfully.')
    } catch (error) {
      setDeleting(null)
      setNotice(error instanceof Error ? error.message : 'Unable to delete resource')
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return resources.filter(resource => resource.facility_id === Number(facilityId) && (!query || `${resource.name} ${resource.category}`.toLowerCase().includes(query)))
  }, [resources, facilityId, search])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  function changeQuantity(value: number) {
    const next = Math.max(1, value || 1)
    setQuantity(next)
    setIdentifiers(current => Array.from({ length: next }, (_, index) => current[index] ?? ''))
  }
  function beginEdit(resource: Resource) {
    setFacilityId(String(resource.facility_id)); setEditing(resource); setQuantity(resource.quantity)
    setIdentifiers(resource.assets.map(asset => asset.identifier).slice(0, resource.quantity))
  }
  function cancelEdit() { setEditing(null); setQuantity(1); setIdentifiers(['']) }

  return <div className="admin-module">
    <div className="module-grid">
      <section className="panel form-panel">
        <h3>{editing ? 'Edit resource' : 'Add a resource'}</h3>
        <form onSubmit={save} key={editing?.id ?? 'new'}>
          <label>Facility<select value={facilityId} onChange={event => setFacilityId(event.target.value)} disabled={!!editing} required><option value="">Choose facility</option>{facilities.map(facility => <option value={facility.id} key={facility.id}>{facility.name}</option>)}</select></label>
          <label>Name<input name="name" defaultValue={editing?.name} required /></label>
          <label>Category<input name="category" defaultValue={editing?.category} required /></label>
          <label>Quantity<input name="quantity" type="number" min="1" value={quantity} onChange={event => changeQuantity(Number(event.target.value))} required /></label>
          <fieldset className="asset-identifiers"><legend>Serial / unique asset numbers</legend><p>Enter one identifier for each physical unit. These numbers are used for maintenance tracking.</p>{identifiers.map((identifier,index)=><label key={index}><span>Unit {index+1}</span><input value={identifier} onChange={event=>setIdentifiers(values=>values.map((value,itemIndex)=>itemIndex===index?event.target.value:value))} placeholder={`e.g. ${editing?'ASSET':'LAB-EQP'}-${String(index+1).padStart(3,'0')}`} required /></label>)}</fieldset>
          <div className="form-actions"><button className="primary">{editing ? 'Update resource' : 'Save resource'}</button>{editing && <button type="button" className="secondary" onClick={cancelEdit}>Cancel</button>}</div>
        </form>
        {notice && <div className="form-message">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      </section>
      <section className="panel list-panel">
        <div className="panel-title"><div><h3>Recorded resources</h3><p>{filtered.length} matching records</p></div></div>
        {facilityId && <div className="facility-tools"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or category…" /></div>}
        {!facilityId ? <p className="form-hint">Select a facility to view its resources.</p> : visible.length === 0 ? <p className="empty-state">No resources match this search.</p> : visible.map(resource => <div className="table-row resource-record" key={resource.id}><div><b>{resource.name}</b><small>{resource.category} · {resource.quantity} individually tracked unit{resource.quantity===1?'':'s'}</small><div className="serial-preview">{resource.assets.slice(0,3).map(asset=><span key={asset.id}>{asset.identifier}</span>)}{resource.assets.length>3&&<em>+{resource.assets.length-3} more</em>}</div></div><span className="resource-actions"><button type="button" onClick={() => beginEdit(resource)}>Edit</button><button type="button" onClick={() => setDeleting(resource)}>Delete</button></span></div>)}
        {facilityId && <div className="pagination"><span>Page {page} of {pages}</span><div><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><button type="button" disabled={page === pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>}
      </section>
    </div>
    {deleting && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-resource-title"><div className="modal"><p className="eyebrow">DELETE RESOURCE</p><h2 id="delete-resource-title">Delete {deleting.name}?</h2><p className="confirm-copy">This resource will be permanently removed from the selected facility.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDeleting(null)}>Keep resource</button><button type="button" className="primary danger" onClick={confirmDelete}>Delete resource</button></div></div></div>}
  </div>
}

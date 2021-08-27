import {
  parse,
  parseFromClause,
  SelectStatement,
  FromTableNode,
  ColumnRefNode,
  IncompleteSubqueryNode,
  FromClauseParserResult,
  DeleteStatement,
  NodeRange
} from '@joe-re/sql-parser'
import log4js from 'log4js'
import { Schema, Table, Column, DbFunction } from './database_libs/AbstractClient'
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver-types';

type Pos = { line: number, column: number }

const logger = log4js.getLogger()

const FROM_KEYWORD = { label: 'FROM', kind: CompletionItemKind.Text }

const CLAUSES: CompletionItem[] = [
  { label: 'WHERE', kind: CompletionItemKind.Text },
  { label: 'ORDER BY', kind: CompletionItemKind.Text },
  { label: 'GROUP BY', kind: CompletionItemKind.Text },
  { label: 'LIMIT', kind: CompletionItemKind.Text }
]

function extractExpectedLiterals(expected: { type: string, text: string }[]): CompletionItem[] {
  return expected.filter(v => v.type === 'literal')
    .map(v => v.text)
    .filter((v, i, self) => self.indexOf(v) === i)
    .map(v => ( { label: v }))
}


function getColumnRefByPos(columns: ColumnRefNode[], pos: { line: number, column: number }) {
  return columns.find(v =>
    (v.location.start.line === pos.line + 1 && v.location.start.column <= pos.column) &&
    (v.location.end.line === pos.line + 1 && v.location.end.column >= pos.column)
  )
}

function isPosInLocation(location: NodeRange, pos: Pos) {
  return (location.start.line === pos.line + 1 && location.start.column <= pos.column) &&
    (location.end.line === pos.line + 1 && location.end.column >= pos.column)
}

function getFromNodeByPos(fromNodes: FromTableNode[], pos: { line: number, column: number }) {
  return fromNodes.find(v => isPosInLocation(v.location, pos))
}

function toCompletionItemFromTable(table: Table): CompletionItem {
  return {
    label: table.tableName,
    detail: 'table',
    kind: CompletionItemKind.Field,
  }
}

function toCompletionItemFromFunction(f: DbFunction): CompletionItem {
  return {
    label: f.name,
    detail: 'function',
    kind: CompletionItemKind.Property,
    documentation : f.description
  }
}

function toCompletionItemFromAlias(alias: string): CompletionItem {
  return {
    label: alias,
    detail: 'alias',
    kind: CompletionItemKind.Variable,
  }
}

function toCompletionItemFromColumn(tableName: string, column: Column): CompletionItem {
  return {
    label: column.columnName,
    detail: `column ${column.description}`,
    kind: CompletionItemKind.Interface,
    data: {tableName: tableName},
  }
}

function getTableAndColumnCondidates(tablePrefix: string, schema: Schema, option?: { withoutTable?: boolean, withoutColumn?: boolean }): CompletionItem[] {
  const tableCandidates = schema.filter(v => v.tableName.startsWith(tablePrefix)).map(v => toCompletionItemFromTable(v))
  const columnCandidates = Array.prototype.concat.apply([],
    schema.filter(v => tableCandidates.map(v => v.label).includes(v.tableName)).map(v => v.columns)
  ).map((v: Column) => toCompletionItemFromColumn(tablePrefix, v))

  const candidates: CompletionItem[] = []
  if (!option?.withoutTable) {
    candidates.push(...tableCandidates)
  }
  if (!option?.withoutColumn) {
    candidates.push(...columnCandidates)
  }
  return candidates
}

function getFunctionCondidates(tablePrefix: string, functions: DbFunction[]): CompletionItem[] {
  const tableCandidates = functions.filter(v => v.name.startsWith(tablePrefix)).map(v => toCompletionItemFromFunction(v))
  return tableCandidates
}

function isCursorOnFromClause(sql: string, pos: Pos) {
  try {
    const ast = parse(sql) as SelectStatement
    return !!getFromNodeByPos(ast.from?.tables || [], pos)
  } catch (_e) {
    return false
  }
}

function getCandidatedFromIncompleteSubquery(params: {
  sql: string,
  incompleteSubquery: IncompleteSubqueryNode,
  pos: Pos,
  schema: Schema
}): CompletionItem[] {
  let candidates: CompletionItem[] = []
  const { schema, incompleteSubquery, pos } = params
  const parsedFromClause = getFromNodesFromClause(incompleteSubquery.text)
  try {
    parse(incompleteSubquery.text);
  } catch (e) {
    if (e.name !== 'SyntaxError') {
      throw e
    }
    const fromText = incompleteSubquery.text
    const newPos = parsedFromClause ? {
      line: pos.line - (incompleteSubquery.location.start.line - 1),
      column: pos.column - incompleteSubquery.location.start.column + 1
    } : { line: 0, column: 0 }
    candidates = complete(fromText, newPos, schema).candidates
  }
  return candidates
}

function createTablesFromFromNodes(fromNodes: FromTableNode[]): Schema {
  return fromNodes.reduce((p: any, c) => {
    if (c.type !== 'subquery') {
      return p
    }
    if (!Array.isArray(c.subquery.columns)) {
      return p
    }
    const columns = c.subquery.columns.map(v => {
      if (typeof v === 'string') { return null }
      return { columnName: v.as || (v.expr.type === 'column_ref' && v.expr.column) || '', description: 'alias' }
    })
    return p.concat({ database: null, columns, tableName: c.as })
  }, [])
}

function getLastTokenIncludingDot(sql: string) {
  const match = sql.match(/^(?:.|\s)*[^A-z0-9\.:](.*?)$/)
  if (!match) { return sql }
  return match[1]
}

type AttachedAlias = {
  table: Table
  as: (string|null)[],
  refName: string,
}

function findTable(fromNodes: FromTableNode[], schema: Schema, partialColumName: string): AttachedAlias|undefined {
  const attachedAlias: AttachedAlias[] = schema.map(v => {
    const as = fromNodes.filter((v2: any) => v.tableName === v2.table).map(v => v.as)
    return {table: v, as: as ? as : [], refName: '' }
  })

  let found: AttachedAlias|undefined
  for (let idx=0; found == undefined && idx<attachedAlias.length; idx++) {
    let aAlias = attachedAlias[idx]
    if (partialColumName.startsWith(aAlias.table.tableName + '.')) {
      found = Object.assign({}, aAlias, {refName: aAlias.table.tableName})
      break
    }
    else {
      for (let asIdx=0; asIdx<aAlias.as.length; asIdx++) {
        let as:string|null = aAlias.as[asIdx]
        if (as) {
          if (partialColumName.startsWith(as + '.')) {
            found = Object.assign({}, aAlias, {refName: as})
            break
          }
        }
      }
    }
  }
  return found
}

function findAlias(fromNodes: FromTableNode[], schema: Schema, partialName: string): string[] {
  const attachedAlias: AttachedAlias[] = schema.map(v => {
    const as = fromNodes.filter((v2: any) => v.tableName === v2.table).map(v => v.as)
    return {table: v, as: as ? as : [], refName: '' }
  })

  let aliasArray: string[] = []
  for (let idx=0; idx<attachedAlias.length; idx++) {
    let aAlias = attachedAlias[idx]
    // if (aAlias.table.tableName.startsWith(partialName)) {
    //   //aliasArray.push(aAlias.table.tableName)
    // }
    // else
     {
      for (let asIdx=0; asIdx<aAlias.as.length; asIdx++) {
        let as:string|null = aAlias.as[asIdx]
        if (as) {
          if (as.startsWith(partialName)) {
            aliasArray.push(as)
          }
        }
      }
    }
  }
  return aliasArray
}

function getCandidatesFromError(target: string, schema: Schema, pos: Pos, e: any, fromNodes: FromTableNode[]): CompletionItem[] {
  switch(e.message) {
    // 'INSERT INTO TABLE1 (C'
    case 'EXPECTED COLUMN NAME': {
      return getTableAndColumnCondidates('', schema, { withoutTable: true })
    }
  }
  let candidates = extractExpectedLiterals(e.expected || [])
  const candidatesLiterals = candidates.map(v => v.label)
  // Check if parser expects us to terminate a single quote value or double quoted column name
  // SELECT TABLE1.COLUMN1 FROM TABLE1 WHERE TABLE1.COLUMN1 = "hoge.
  if (candidatesLiterals.includes("'") || candidatesLiterals.includes('"')) {
    return []
  }
  // UPDATE table_name
  // SET column1 = value1, column2 = value2, ...
  // WHERE condition;
  // 'UPDATE FOO S'
  // 'SELECT TABLE1.COLUMN1 FROM TABLE WHERE T'
  if (candidatesLiterals.includes('.')) {
    candidates = candidates.concat(schema.map(v => toCompletionItemFromTable(v)))
  }
  const lastChar = target[target.length - 1]
  logger.debug(`lastChar: ${lastChar}`)
  const removedLastDotTarget = target.slice(0, target.length - 1)
  // Do not complete column name when a cursor is on dot in from clause
  // SELECT TABLE1.COLUMN1 FROM TABLE1.
  if (isCursorOnFromClause(removedLastDotTarget, { line: pos.line, column: pos.column - 1})) {
    return []
  }
  const partialName = getLastTokenIncludingDot(target)
  const subqueryTables = createTablesFromFromNodes(fromNodes)
  const schemaAndSubqueries = schema.concat(subqueryTables)
  let found = findTable(fromNodes, schemaAndSubqueries, partialName)

  if (found) {
    let refName = found.refName
    candidates = found.table.columns.map(v => toCompletionItemFromColumn(refName, v))
  }

  let aliasArray = findAlias(fromNodes, schemaAndSubqueries, partialName)
  if (aliasArray.length > 0) {
    let aliasCandidates = aliasArray.map(v => toCompletionItemFromAlias(v))
    candidates = candidates.concat(aliasCandidates)
  }


  return candidates
}

function getFromNodesFromClause(sql: string): FromClauseParserResult | null {
  try {
    return parseFromClause(sql) as any
  } catch (_e) {
    // no-op
    return null
  }
}

function getRidOfAfterCursorString(sql: string, pos: Pos) {
  return sql.split('\n').filter((_v, idx) => pos.line >= idx).map((v, idx) => idx === pos.line ? v.slice(0, pos.column) : v).join('\n')
}

function completeDeleteStatement (ast: DeleteStatement, pos: Pos, schema: Schema): CompletionItem[] {
  if (isPosInLocation(ast.table.location, pos)) {
    return getTableAndColumnCondidates('', schema, { withoutColumn: true })
  } else if (ast.where && isPosInLocation(ast.where.expression.location, pos)) {
    return getTableAndColumnCondidates('', schema, { withoutTable: true })
  }
  return []
}

function completeSelectStatement(ast: SelectStatement, _pos: Pos, _schema: Schema): CompletionItem[] {
  let candidates: CompletionItem[] = []
  if (Array.isArray(ast.columns)) {
    const first = ast.columns[0]
    const rest = ast.columns.slice(1, ast.columns.length)
    const lastColumn = rest.reduce((p, c) => p.location.end.offset < c.location.end.offset ? c : p ,first)
    if (
      (lastColumn.expr.type === 'column_ref' && FROM_KEYWORD.label.startsWith(lastColumn.expr.column)) ||
      (lastColumn.as && FROM_KEYWORD.label.startsWith(lastColumn.as))
     ) {
      candidates.push(FROM_KEYWORD)
    }
  }
  return candidates
}

export default function complete(sql: string, pos: Pos, schema: Schema = [], functions: DbFunction[] = []) {
  logger.debug(`complete: ${sql}, ${JSON.stringify(pos)}`)
  let candidates: CompletionItem[] = []
  let error = null;

  const target = getRidOfAfterCursorString(sql, pos)
  logger.debug(`target: ${target}`)
  try {
    candidates = CLAUSES.concat([])
    const ast = parse(target);
    logger.debug(`ast: ${JSON.stringify(ast)}`)
    if (ast.type === 'delete') {
      candidates = completeDeleteStatement(ast, pos, schema)
    } else {
      if (ast.type === 'select' && !ast.distinct) {
        candidates.push({ label: 'DISTINCT', kind: CompletionItemKind.Text })
      }
      if (ast.type === 'select') {
        candidates = candidates.concat(completeSelectStatement(ast, pos, schema))
      }
      const columns = ast.columns
      if (Array.isArray(columns)) {
        const selectColumnRefs = (columns as any).map((v: any) => v.expr).filter((v: any) => !!v)
        let whereColumnRefs: any[] = []
        if (ast.type === 'select') {
          if (Array.isArray(ast.where)){
            for (let i=0; i<ast.where.length; i++) {
              whereColumnRefs.push(ast.where[i].expression)
            }
          }
          else if (ast.where) {
            whereColumnRefs.push(ast.where.expression)
          }
        }
        const columnRef = getColumnRefByPos(selectColumnRefs.concat(whereColumnRefs), pos)
        logger.debug(JSON.stringify(columnRef))
        if (columnRef) {
          if (columnRef.table?.length > 0) {
            let tableCandidates = getTableAndColumnCondidates(columnRef.table, schema, { withoutColumn: true })
            candidates = candidates.concat(tableCandidates)
            let partialColumName = columnRef.table + '.' + columnRef.column
            const parsedFromClause = getFromNodesFromClause(sql)
            const fromNodes = parsedFromClause?.from?.tables || []
            const subqueryTables = createTablesFromFromNodes(fromNodes)
            const schemaAndSubqueries = schema.concat(subqueryTables)
            let found = findTable(fromNodes, schemaAndSubqueries, partialColumName)
            if (found) {
              let refName = found.refName
              let columnCandidatesAliasScope = found.table.columns.map(v => toCompletionItemFromColumn(refName, v))
              candidates = candidates.concat(columnCandidatesAliasScope)
            }
          }
          else {
            let functionCandidates = getFunctionCondidates(columnRef.table, functions)
            candidates = candidates.concat(functionCandidates)
            let tableCandidates = getTableAndColumnCondidates(columnRef.column, schema, { withoutColumn: true })
            candidates = candidates.concat(tableCandidates)
            let partialAliasName = columnRef.column
            const parsedFromClause = getFromNodesFromClause(sql)
            const fromNodes = parsedFromClause?.from?.tables || []
            const subqueryTables = createTablesFromFromNodes(fromNodes)
            const schemaAndSubqueries = schema.concat(subqueryTables)
            let aliasArray = findAlias(fromNodes, schemaAndSubqueries, partialAliasName)
            if (aliasArray.length > 0) {
              let aliasCandidates = aliasArray.map(v => toCompletionItemFromAlias(v))
              candidates = candidates.concat(aliasCandidates)
            }
          }
        }
      }

      if (ast.type === 'select' && Array.isArray(ast.from?.tables)) {
        const fromTable = getFromNodeByPos(ast.from?.tables || [], pos)
        if (fromTable && fromTable.type === 'table') {
          candidates = candidates.concat(schema.map(v => toCompletionItemFromTable(v)))
            .concat([{ label: 'INNER JOIN' }, { label: 'LEFT JOIN' }])
          if (fromTable.join && !fromTable.on) {
            candidates.push({ label: 'ON' })
          }
        }
      }
    }
  } catch (e) {
    logger.debug('error')
    logger.debug(e)
    if (e.name !== 'SyntaxError') {
      throw e
    }
    const parsedFromClause = getFromNodesFromClause(sql)
    const fromNodes = parsedFromClause?.from?.tables || []
    const fromNodeOnCursor = getFromNodeByPos(fromNodes || [], pos)
    // Incomplete sub query
    // SELECT sub FROM (SELECT e. FROM employees e) sub'
    if (fromNodeOnCursor && fromNodeOnCursor.type === 'incomplete_subquery') {
      candidates = getCandidatedFromIncompleteSubquery({
        sql,
        pos,
        incompleteSubquery: fromNodeOnCursor,
        schema
      })
    } else {
      candidates = getCandidatesFromError(target, schema, pos, e, fromNodes)
    }
    error = { label: e.name, detail: e.message, line: e.line, offset: e.offset }
  }
  const lastToken = getLastTokenIncludingDot(target)
  logger.debug(`lastToken: ${lastToken}`)
  logger.debug(JSON.stringify(candidates))
  candidates = candidates.filter(v => 
    v.label.startsWith(lastToken) ||
    (v.data?.tableName + '.' + v.label).startsWith(lastToken)
    )
  
    candidates = candidates.map(v => {
      if (v.data?.tableName) {
        let fullyQualifiedField = v.data.tableName + '.' + v.label
        if (fullyQualifiedField.startsWith(lastToken)) {
          let columnPrefix = lastToken.substr(v.data.tableName.length + 1)
          v.insertText = v.label.substr(columnPrefix.length)
        }
      }
      return v
    }
  )

  // candidates = []
  // candidates.push({label: 'Text', kind: CompletionItemKind.Text})
  // candidates.push({label: 'Method', kind: CompletionItemKind.Method})
  // candidates.push({label: 'Function', kind: CompletionItemKind.Function})
  // candidates.push({label: 'Constructor', kind: CompletionItemKind.Constructor})
  // candidates.push({label: 'Field', kind: CompletionItemKind.Field})
  // candidates.push({label: 'Variable', kind: CompletionItemKind.Variable})
  // candidates.push({label: 'Class', kind: CompletionItemKind.Class})
  // candidates.push({label: 'Interface', kind: CompletionItemKind.Interface})
  // candidates.push({label: 'Module', kind: CompletionItemKind.Module})
  // candidates.push({label: 'Property', kind: CompletionItemKind.Property})
  // candidates.push({label: 'Unit', kind: CompletionItemKind.Unit})
  // candidates.push({label: 'Value', kind: CompletionItemKind.Value})
  // candidates.push({label: 'Enum', kind: CompletionItemKind.Enum})
  // candidates.push({label: 'Keyword', kind: CompletionItemKind.Keyword})
  // candidates.push({label: 'Snippet', kind: CompletionItemKind.Snippet})
  // candidates.push({label: 'Color', kind: CompletionItemKind.Color})
  // candidates.push({label: 'File', kind: CompletionItemKind.File})
  // candidates.push({label: 'Reference', kind: CompletionItemKind.Reference})
  // candidates.push({label: 'Folder', kind: CompletionItemKind.Folder})
  // candidates.push({label: 'EnumMember', kind: CompletionItemKind.EnumMember})
  // candidates.push({label: 'Constant', kind: CompletionItemKind.Constant})
  // candidates.push({label: 'Struct', kind: CompletionItemKind.Struct})
  // candidates.push({label: 'Event', kind: CompletionItemKind.Event})
  // candidates.push({label: 'Operator', kind: CompletionItemKind.Operator})
  // candidates.push({label: 'TypeParameter', kind: CompletionItemKind.TypeParameter})

  return { candidates, error }
}

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

const KEYWORD_ICON = CompletionItemKind.Event
function keyword(name: string): CompletionItem {
  return { label: name, kind: KEYWORD_ICON, detail: 'keyword' }
}

const FROM_KEYWORD = keyword('FROM')
const AS_KEYWORD = keyword('AS')
const DISTINCT_KEYWORD = keyword('DISTINCT')
const INNERJOIN_KEYWORD = keyword('INNER JOIN')
const LEFTJOIN_KEYWORD = keyword('LEFT JOIN')
const ON_KEYWORD = keyword('ON')

const CLAUSES: CompletionItem[] = [
  keyword('SELECT'),
  keyword('select'),
  keyword('WHERE'),
  keyword('where'),
  keyword('ORDER BY'),
  keyword('order by'),
  keyword('GROUP BY'),
  keyword('group by'),
  keyword('LIMIT'),
  keyword('limit'),
  keyword('--'),
  keyword('/*'),
  keyword('(')
]

const UNDESIRED_LITERAL = [
  '+',
  '-',
  '*',
  '$',
  ':',
  'COUNT',
  'AVG',
  'SUM',
  '`',
  '"',
  "'",
]

// Check if parser expects us to terminate a single quote value or double quoted column name
// SELECT TABLE1.COLUMN1 FROM TABLE1 WHERE TABLE1.COLUMN1 = "hoge.
// We don't offer the ', the ", the ` as suggestions
function extractExpectedLiterals(expected: { type: string, text: string }[]): CompletionItem[] {
  const literals = expected.filter(v => v.type === 'literal').map(v => v.text)
  const uniqueLiterals = [...new Set(literals)];
  return uniqueLiterals
    .filter(v => !UNDESIRED_LITERAL.includes(v))
    .map(v => v == 'ORDER' ? 'ORDER BY' : v)
    .map(v => v == 'GROUP' ? 'GROUP BY' : v)
    .flatMap(v => [keyword(v.toLocaleLowerCase()), keyword(v),])
}

function getColumnRefByPos(columns: ColumnRefNode[], pos: Pos) {
  return columns.find(v =>
    (v.location.start.line === pos.line + 1 && v.location.start.column <= pos.column) &&
    (v.location.end.line === pos.line + 1 && v.location.end.column >= pos.column)
  )
}

function isPosInLocation(location: NodeRange, pos: Pos) {
  return (location.start.line === pos.line + 1 && location.start.column <= pos.column) &&
    (location.end.line === pos.line + 1 && location.end.column >= pos.column)
}

function getFromNodeByPos(fromNodes: FromTableNode[], pos: Pos) {
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
    documentation: f.description
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
  const columnName = column.columnName
  const scopedColumnName = tableName ? `${tableName}.${columnName}` : columnName
  return {
    label: columnName,
    detail: `column ${column.description}`,
    kind: CompletionItemKind.Interface,
    data: { scopedColumnName: scopedColumnName },
  }
}

function getStartsWithTableCondidates(tablePrefix: string, tables: Table[]): CompletionItem[] {
  return tables
    .filter(table => table.tableName.startsWith(tablePrefix))
    .map(table => toCompletionItemFromTable(table))
}

function getColumnCondidates(tablePrefix: string, tables: Table[]): CompletionItem[] {
  const tableCandidates: string[] = tables
    .filter(table => table.tableName.startsWith(tablePrefix))
    .map(table => toCompletionItemFromTable(table))
    .map(tableCandidate => tableCandidate.label)
  const columns: Column[] = tables
    .filter(table => tableCandidates.includes(table.tableName))
    .flatMap(table => table.columns)
  return columns.map(c => toCompletionItemFromColumn(tablePrefix, c))
}

function getFunctionCondidates(prefix: string, functions: DbFunction[]): CompletionItem[] {
  if (!prefix) {
    // Nothing was typed, return all lowercase functions
    return functions.map(v => toCompletionItemFromFunction(v))
  }
  else {
    // If user typed the start of the function
    const lower = prefix.toLowerCase()
    const isTypedUpper = (prefix != lower)
    return functions
      // Search using lowercase prefix
      .filter(v => v.name.startsWith(lower))
      // If typed string is in upper case, then return upper case suggestions
      .map(v => {
        if (isTypedUpper) v.name = v.name.toUpperCase()
        return v
      })
      .map(v => toCompletionItemFromFunction(v))
  }

}

function isCursorOnFromClause(sql: string, pos: Pos) {
  try {
    const ast = parse(sql) as SelectStatement
    return !!getFromNodeByPos(ast.from?.tables || [], pos)
  } catch (_e) {
    return false
  }
}

function getCandidatedForIncompleteSubquery(incompleteSubquery: IncompleteSubqueryNode, pos: Pos, schema: Schema): CompletionItem[] {
  let candidates: CompletionItem[] = []
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

function createTablesFromFromNodes(fromNodes: FromTableNode[]): Table[] {
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

function getColumnCandidatesByTableScope(tables: Table[], scopedPartialColumName: string): CompletionItem[] {
  return tables
    .filter(table => scopedPartialColumName.startsWith(table.tableName + '.'))
    .flatMap(table =>
      table.columns.map(col => {
        return { column: col, tableName: table.tableName }
      })
    )
    .map(colInfo => toCompletionItemFromColumn(colInfo.tableName, colInfo.column))
}

function getColumnCandidatesByAliasScope(fromNodes: FromTableNode[], tables: Table[], scopedPartialColumName: string): CompletionItem[] {
  return tables.flatMap(table => {
    return fromNodes.filter((fromNode: any) =>
      fromNode.table === table.tableName &&
      fromNode.as &&
      scopedPartialColumName.startsWith(fromNode.as + '.')
    )
      .flatMap(fromNode =>
        table.columns.map(col => {
          return { column: col, alias: fromNode.as }
        })
      )
      .map(colInfo => toCompletionItemFromColumn(colInfo.alias || '', colInfo.column))
  })
}

function getAliasCandidates(fromNodes: FromTableNode[], tables: Table[], partialName: string): CompletionItem[] {
  return tables.flatMap(table => {
    return fromNodes.filter((fromNode: any) =>
      fromNode.as &&
      fromNode.as.startsWith(partialName) &&
      fromNode.table === table.tableName)
      .map(fromNode => toCompletionItemFromAlias(fromNode.as || ''))
  })
}

function getCandidatesForError(target: string, schema: Schema, pos: Pos, e: any, fromNodes: FromTableNode[]): CompletionItem[] {
  switch (e.message) {
    // 'INSERT INTO TABLE1 (C'
    // 'UPDATE TABLE1 SET C'
    case 'EXPECTED COLUMN NAME': {
      return getColumnCondidates('', schema.tables)
    }
  }
  const removedLastDotTarget = target.slice(0, target.length - 1)
  // Do not complete column name when a cursor is on dot in from clause
  // SELECT TABLE1.COLUMN1 FROM TABLE1.
  const testPos = { line: pos.line, column: pos.column - 1 }
  if (isCursorOnFromClause(removedLastDotTarget, testPos)) {
    return []
  }

  let candidates = extractExpectedLiterals(e.expected || [])

  // 'UPDATE table_name
  // SET column1 = value1, column2 = value2, ...
  // WHERE condition;'
  // 'UPDATE FOO S'
  // 'SELECT TABLE1.COLUMN1 FROM TABLE WHERE T'
  if (candidates.some(v => v.label === '.')) {
    candidates = candidates.concat(getStartsWithTableCondidates('', schema.tables))
  }

  const subqueryTables = createTablesFromFromNodes(fromNodes)
  const schemaAndSubqueries = schema.tables.concat(subqueryTables)
  const partialName = getLastTokenIncludingDot(target)
  candidates = candidates.concat(
    getColumnCandidatesByTableScope(schemaAndSubqueries, partialName),
    getColumnCandidatesByAliasScope(fromNodes, schemaAndSubqueries, partialName),
    getFunctionCondidates(partialName, schema.functions),
    getAliasCandidates(fromNodes, schemaAndSubqueries, partialName)
  )
  logger.debug(`candidates from error returns: ${JSON.stringify(candidates)}`)
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
  return sql
    .split('\n')
    .filter((_v, idx) => pos.line >= idx)
    .map((v, idx) => idx === pos.line ? v.slice(0, pos.column) : v)
    .join('\n')
}

function completeDeleteStatement(ast: DeleteStatement, pos: Pos, tables: Table[]): CompletionItem[] {
  if (isPosInLocation(ast.table.location, pos)) {
    return getStartsWithTableCondidates('', tables)
  }
  else if (ast.where && isPosInLocation(ast.where.expression.location, pos)) {
    return getColumnCondidates('', tables)
  }
  return []
}

function completeSelectStatement(ast: SelectStatement, _pos: Pos, _tables: Table[]): CompletionItem[] {
  let candidates: CompletionItem[] = []
  if (Array.isArray(ast.columns)) {
    const first = ast.columns[0]
    const rest = ast.columns.slice(1, ast.columns.length)
    const lastColumn = rest.reduce((p, c) => p.location.end.offset < c.location.end.offset ? c : p, first)
    if (lastColumn.as) {
      if (FROM_KEYWORD.label.startsWith(lastColumn.as)) {
        candidates.push(FROM_KEYWORD)
      }
      else if (AS_KEYWORD.label.startsWith(lastColumn.as)) {
        candidates.push(AS_KEYWORD)
      }
    }
  }
  return candidates
}

function getColumnAtPosition(ast: any, pos: Pos): ColumnRefNode | undefined {
  const columns = ast.columns
  if (Array.isArray(columns)) {
    // columns in select clause
    const columnRefs = (columns as any).map((col: any) => col.expr).filter((expr: any) => !!expr)
    if (ast.type === 'select' && ast.where?.expression) {
      // columns in where clause  
      columnRefs.push(ast.where.expression)
    }
    // column at position
    const columnRef = getColumnRefByPos(columnRefs, pos)
    logger.debug(JSON.stringify(columnRef))
    return columnRef
  }
  return undefined
}

function getJoinCondidates(ast: any, schema: Schema, pos: Pos): CompletionItem[] {
  // from clause: complete 'ON' keyword on 'INNER JOIN'
  if (ast.type === 'select' && Array.isArray(ast.from?.tables)) {
    const fromTable = getFromNodeByPos(ast.from?.tables || [], pos)
    if (fromTable && fromTable.type === 'table') {
      const candidates = schema.tables.map(v => toCompletionItemFromTable(v))
      candidates.push(INNERJOIN_KEYWORD, LEFTJOIN_KEYWORD)
      // = candidates.concat([{ label: 'INNER JOIN' }, { label: 'LEFT JOIN' }])
      if (fromTable.join && !fromTable.on) {
        candidates.push(ON_KEYWORD)
      }
      return candidates
    }
  }
  return []
}

function getCandidatesForParsedQuery(sql: string, ast: any, schema: Schema, pos: Pos): CompletionItem[] {
  logger.debug(`getting candidates for parse query ast: ${JSON.stringify(ast)}`)
  if (ast.type === 'delete') {
    return completeDeleteStatement(ast, pos, schema.tables)
  }
  else {
    let candidates = CLAUSES
    if (ast.type === 'select') {
      candidates = candidates.concat(completeSelectStatement(ast, pos, schema.tables))
      if (!ast.distinct) {
        candidates.push(DISTINCT_KEYWORD)
      }
    }
    const columnRef = getColumnAtPosition(ast, pos)
    if (!columnRef) {
      candidates = candidates.concat(getJoinCondidates(ast, schema, pos))
    }
    else {
      const parsedFromClause = getFromNodesFromClause(sql)
      const fromNodes = parsedFromClause?.from?.tables || []
      const subqueryTables = createTablesFromFromNodes(fromNodes)
      const schemaAndSubqueries = schema.tables.concat(subqueryTables)

      if (columnRef.table) {
        // We know what table/alias this column belongs to
        const partialColumnName = columnRef.column
        const tableOrAlias = columnRef.table
        let scopedPartialColumnName = tableOrAlias + '.' + partialColumnName
        // Find the corresponding table and suggest it's columns
        candidates = candidates.concat(
          getColumnCandidatesByTableScope(schemaAndSubqueries, scopedPartialColumnName),
          getColumnCandidatesByAliasScope(fromNodes, schemaAndSubqueries, scopedPartialColumnName))
      }
      else {
        // Column is not scoped to a table/alias yet
        const partialName = columnRef.column
        // Could be an alias, a talbe or a function
        candidates = candidates.concat(
          getAliasCandidates(fromNodes, schemaAndSubqueries, partialName),
          getStartsWithTableCondidates(partialName, schema.tables),
          getFunctionCondidates(partialName, schema.functions))
      }
    }
    logger.debug(`parse query returns: ${JSON.stringify(candidates)}`)
    return candidates
  }
}

function filterCandidatesByLastToken(target: string, candidates: CompletionItem[]): CompletionItem[] {
  const lastToken = getLastTokenIncludingDot(target)
  logger.debug(`filter based on lastToken: ${lastToken}`)
  logger.debug(`candidates are: ${JSON.stringify(candidates)}`)
  return candidates
    .filter(v => {
      // Match the last token to the scoped column name (tableName/Alias)
      // If not specified i.e.: FROM, WHERE keywords then simply use the label
      const col = v.data?.scopedColumnName || v.label
      return col.startsWith(lastToken)
    })
    .map(v => {
      // When dealing with a scoped column (tableName/Alias)
      // Set the insertText so that editor does not append full label
      // but rather inserts missing suffix
      if (v.data?.scopedColumnName.startsWith(lastToken)) {
        v.insertText = v.data?.scopedColumnName.substr(lastToken.length)
      }
      return v
    })
}

export default function complete(sql: string, pos: Pos, schema: Schema = { tables: [], functions: [] }) {
  logger.debug(`start complete: ${sql}, ${JSON.stringify(pos)}`)
  let candidates: CompletionItem[] = []
  let error = null;

  const target = getRidOfAfterCursorString(sql, pos)
  logger.debug(`target: ${target}`)
  try {
    const ast = parse(target);
    candidates = getCandidatesForParsedQuery(sql, ast, schema, pos)
  }
  catch (e) {
    logger.debug(`error: ${e}`)
    if (e.name !== 'SyntaxError') {
      throw e
    }
    const parsedFromClause = getFromNodesFromClause(sql)
    const fromNodes = parsedFromClause?.from?.tables || []
    const fromNodeOnCursor = getFromNodeByPos(fromNodes, pos)
    if (fromNodeOnCursor?.type === 'incomplete_subquery') {
      // Incomplete sub query 'SELECT sub FROM (SELECT e. FROM employees e) sub'
      candidates = getCandidatedForIncompleteSubquery(fromNodeOnCursor, pos, schema)
    } else {
      candidates = getCandidatesForError(target, schema, pos, e, fromNodes)
    }
    error = { label: e.name, detail: e.message, line: e.line, offset: e.offset }
  }

  candidates = filterCandidatesByLastToken(target, candidates)
  return { candidates, error }
}

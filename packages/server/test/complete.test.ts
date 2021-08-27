import complete from '../src/complete'

describe('keyword completion', () => {
  test("complete 'SELECT' keyword", () => {
    const result = complete('S', { line: 0, column: 1 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('SELECT')
  })

  describe('FROM keyword', () => {
    test("complete FROM word with the star column", () => {
      const result = complete('SELECT * F', { line: 0, column: 10 })
      expect(result.candidates.length).toEqual(1)
      expect(result.candidates[0].label).toEqual('FROM')
    })

    test("complete FROM word with norm columns", () => {
      const result = complete('SELECT d, f F', { line: 0, column: 13 })
      expect(result.candidates.length).toEqual(1)
      expect(result.candidates[0].label).toEqual('FROM')
    })

    test("complete FROM word with norm columns", () => {
      const result = complete('SELECT d, f AS F', { line: 0, column: 16 })
      // TODO: this is not correct but difficult to fix...
      expect(result.candidates.length).toEqual(1)
      expect(result.candidates[0].label).toEqual('FROM')
    })
    test("complete FROM word with norm columns", () => {
      const result = complete('SELECT d, f AS aa F', { line: 0, column: 19 })
      expect(result.candidates.length).toEqual(1)
      expect(result.candidates[0].label).toEqual('FROM')
    })
  test("complete FROM word with norm columns", () => {
    const result = complete('SELECT d, f A', { line: 0, column: 13 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('AS')
  })
})

  test("complete 'WHERE' keyword", () => {
    const result = complete('SELECT * FROM FOO W', { line: 0, column: 19 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('WHERE')
  })


  test("complete 'DISTINCT' keyword", () => {
    const result = complete('SELECT D', { line: 0, column: 9 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('DISTINCT')
  })

  test("complete 'INESRT' keyword", () => {
    const result = complete('I', { line: 0, column: 1 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('INSERT')
  })

  test("complete 'INTO' keyword", () => {
    const result = complete('INSERT I', { line: 0, column: 8 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('INTO')
  })

  test("complete 'INTO' keyword", () => {
    const result = complete('INSERT I', { line: 0, column: 8 })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('INTO')
  })

  test("complete 'VALUES' keyword", () => {
    const sql = 'INSERT INTO FOO ( BAR ) V'
    const result = complete('INSERT INTO FOO (BAR) V', { line: 0, column: sql.length })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('VALUES')
  })

  test("complete 'UPDATE' keyword", () => {
    const sql = 'U'
    const result = complete(sql, { line: 0, column: sql.length })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('UPDATE')
  })

  test("complete 'SET' keyword", () => {
    const sql = 'UPDATE FOO S'
    const result = complete(sql, { line: 0, column: sql.length })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('SET')
  })

  test("complete 'DELETE' keyword", () => {
    const sql = 'D'
    const result = complete(sql, { line: 0, column: sql.length })
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('DELETE')
  })
})

const SIMPLE_SCHEMA = {
  tables: [
    {
      database: null,
      tableName: 'TABLE1',
      columns: [
        { columnName: 'COLUMN1', description: '' },
        { columnName: 'COLUMN2', description: '' }
      ]
    }
  ],
  functions: [
    {
      name: 'array_concat()',
      description: 'desc1'
    },
    {
      name: 'array_contains()',
      description: 'desc2'
    }
  ]
}

describe('on blank space', () => {
  test("complete ", () => {
    const result = complete('', { line: 0, column: 0 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(13)
    let expected = [
      expect.objectContaining({ label: 'SELECT' }),
      expect.objectContaining({ label: 'WHERE' }),
      expect.objectContaining({ label: 'ORDER BY' }),
      expect.objectContaining({ label: 'GROUP BY' }),
      expect.objectContaining({ label: 'LIMIT' }),
      expect.objectContaining({ label: '--' }),
      expect.objectContaining({ label: '/*' }),
      expect.objectContaining({ label: '(' }),
    ]
    expect(result.candidates).toEqual(expect.arrayContaining(expected))
  })

  test("complete inside SELECT", () => {
    const result = complete('SELECT ', { line: 0, column: 7 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(24) // TODO whare are they?
    expect(result.candidates[22].label).toEqual('array_concat()')
    expect(result.candidates[23].label).toEqual('array_contains()')
  })
})

describe('TableName completion', () => {
  test("complete function keyword", () => {
    const result = complete('SELECT arr', { line: 0, column: 10 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('array_concat()')
    expect(result.candidates[1].label).toEqual('array_contains()')
  })

  test("complete function keyword", () => {
    const result = complete('SELECT ARR', { line: 0, column: 10 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('ARRAY_CONCAT()')
    expect(result.candidates[1].label).toEqual('ARRAY_CONTAINS()')
  })

  test("complete TableName", () => {
    const result = complete('SELECT T FROM TABLE1', { line: 0, column: 8 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })
  test("complete TableName", () => {
    const result = complete('SELECT ta FROM TABLE1 as tab', { line: 0, column: 9 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('tab')
  })
})

describe('ColumnName completion', () => {
  test("complete column name", () => {
    const result = complete('SELECT COL FROM TABLE1', { line: 0, column: 10 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  test("complete ColumnName", () => {
    const result = complete('SELECT TABLE1.C FROM TABLE1', { line: 0, column: 15 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    let expected = [
      expect.objectContaining({ label: 'COLUMN1', insertText: 'OLUMN1' }),
      expect.objectContaining({ label: 'COLUMN2', insertText: 'OLUMN2' }),
    ]
    expect(result.candidates).toEqual(expect.arrayContaining(expected))
  })

  test("complete ColumnName with previous back tick column", () => {
    const result = complete('SELECT `COLUMN2`, TABLE1.C FROM TABLE1', { line: 0, column: 26 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  test("complete ColumnName: cursor on dot", () => {
    const result = complete('SELECT TABLE1. FROM TABLE1', { line: 0, column: 14 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  test("complete ColumnName:cursor on dot:multi line", () => {
    const result = complete('SELECT *\nFROM TABLE1\nWHERE TABLE1.', { line: 2, column: 13 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  test("complete ColumnName:cursor on dot:using alias", () => {
    const result = complete('SELECT *\nFROM TABLE1 t\nWHERE t.', { line: 2, column: 8 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  test("complete ColumnName:cursor on dot:using alias", () => {
    const result = complete('SELECT t. FROM TABLE1 as t', { line: 0, column: 9 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  test("complete ColumnName:cursor on first char:using alias", () => {
    const result = complete('SELECT t.C FROM TABLE1 as t', { line: 0, column: 10 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })

  // TODO: should support this
  test("complete ColumnName:cursor on first char:using back tick", () => {
    const result = complete('SELECT `t.C FROM TABLE1 as t', { line: 0, column: 10 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })
})

describe('From clause', () => {
  test("from clause: complete TableName:single line", () => {
    const result = complete('SELECT TABLE1.COLUMN1 FROM T', { line: 0, column: 28 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })

  test("from clause: complete TableName:multi lines", () => {
    const result = complete('SELECT TABLE1.COLUMN1\nFROM T', { line: 1, column: 6 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })

  test("from clause: INNER JOIN", () => {
    const result = complete('SELECT TABLE1.COLUMN1 FROM TABLE1 I', { line: 0, column: 35 }, SIMPLE_SCHEMA)
    expect(result.candidates.map(v => v.label)).toContain('INNER JOIN')
  })

  test("from clause: LEFT JOIN", () => {
    const result = complete('SELECT TABLE1.COLUMN1 FROM TABLE1 L', { line: 0, column: 35 }, SIMPLE_SCHEMA)
    expect(result.candidates.map(v => v.label).includes('LEFT JOIN'))
  });

  test("from clause: complete 'ON' keyword on 'INNER JOIN'", () => {
    const result =
      complete(
        'SELECT TABLE1.COLUMN1 FROM TABLE1 INNER JOIN TABLE2 O',
        { line: 0, column: 53 },
        SIMPLE_SCHEMA
      )
    expect(result.candidates.map(v => v.label)).toContain('ON')
  })
})

describe('Where clause', () => {
  test("where clause: complete TableName", () => {
    const result = complete('SELECT TABLE1.COLUMN1 FROM TABLE1 WHERE T', { line: 0, column: 41 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })
  test("where clause: complete table alias", () => {
    const result = complete('SELECT tab.COLUMN1 FROM TABLE1 as tab WHERE ta', { line: 0, column: 46 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('tab')
  })
})

describe('cursor on dot', () => {
  test("not complete when a cursor is on dot in case sensitive colum name", () => {
    const result =
      complete('SELECT TABLE1.COLUMN1 FROM TABLE1 WHERE TABLE1.COLUMN1 = "COL1.', { line: 0, column: 63 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  test("not complete when a cursor is on dot in case sensitive colum name", () => {
    const result =
      complete('SELECT "COL1. FROM TABLE1', { line: 0, column: 13 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  test("not complete when a cursor is on dot in string literal", () => {
    const result =
      complete("SELECT TABLE1.COLUMN1 FROM TABLE1 WHERE TABLE1.COLUMN1 = 'hoge.", { line: 0, column: 63 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  test("not complete when a cursor is on dot in string literal", () => {
    const result =
      complete("SELECT 'hoge. FROM TABLE1", { line: 0, column: 13 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  // TODO should support this
  test("not complete column name when a cursor is on dot in from clause", () => {
    const result = complete('SELECT TABLE1.COLUMN1 FROM TABLE1.', { line: 0, column: 34 }, SIMPLE_SCHEMA)
    expect(result.candidates.map(v => v.label)).not.toContain('COLUMN1')
    expect(result.candidates.map(v => v.label)).not.toContain('COLUMN2')
  })

  // TODO should support this
  test("not complete when a cursor is on dot in back tick column name", () => {
    const result = complete('SELECT `TABLE1. FROM TABLE1', { line: 0, column: 15 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(0)
  })

  test("not complete when ", () => {
    const result = complete('SELECT    FROM TABLE1', { line: 0, column: 8 }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(24) // TODO what are they?
  })
})

const SIMPLE_NESTED_SCHEMA = {
  tables: [
    {
      database: null,
      tableName: 'TABLE1',
      columns: [
        { columnName: 'abc', description: '' },
        { columnName: 'abc.def', description: '' },
        { columnName: 'abc.def.ghi', description: '' },
        { columnName: 'x', description: '' },
        { columnName: 'x.y', description: '' },
        { columnName: 'x.y.z', description: '' }
      ]
    }
  ],
  functions: []
}

describe('Nested ColumnName completion', () => {
  test("complete ColumnName", () => {
    const result = complete('SELECT TABLE1.a FROM TABLE1', { line: 0, column: 15 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(3)
    let expected = [
      expect.objectContaining({ label: 'abc', insertText: 'bc' }),
      expect.objectContaining({ label: 'abc.def', insertText: 'bc.def' }),
      expect.objectContaining({ label: 'abc.def.ghi', insertText: 'bc.def.ghi' }),
    ]
    expect(result.candidates).toEqual(expect.arrayContaining(expected))
  })

  test("complete ColumnName of nested field, dot", () => {
    const result = complete('SELECT TABLE1.abc. FROM TABLE1', { line: 0, column: 18 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    let expected = [
      expect.objectContaining({ label: 'abc.def', insertText: 'def' }),
      expect.objectContaining({ label: 'abc.def.ghi', insertText: 'def.ghi' }),
    ]
    expect(result.candidates).toEqual(expect.arrayContaining(expected))
  })

  test("complete ColumnName of nested field, chars", () => {
    const result = complete('SELECT TABLE1.abc.d FROM TABLE1', { line: 0, column: 19 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    let expected = [
      expect.objectContaining({ label: 'abc.def', insertText: 'ef' }),
      expect.objectContaining({ label: 'abc.def.ghi', insertText: 'ef.ghi' }),
    ]
    expect(result.candidates).toEqual(expect.arrayContaining(expected))
  })

  test("complete ColumnName:cursor on first char:using alias", () => {
    const result = complete('SELECT t.x.y.z, t. FROM TABLE1 as t', { line: 0, column: 18 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(6)
    expect(result.candidates[0].label).toEqual('abc')
    expect(result.candidates[1].label).toEqual('abc.def')
    expect(result.candidates[2].label).toEqual('abc.def.ghi')
    expect(result.candidates[3].label).toEqual('x')
    expect(result.candidates[4].label).toEqual('x.y')
    expect(result.candidates[5].label).toEqual('x.y.z')
  })

  test("complete ColumnName:cursor on first char:using alias", () => {
    const result = complete('SELECT t.abc. FROM TABLE1 as t', { line: 0, column: 13 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('abc.def')
    expect(result.candidates[1].label).toEqual('abc.def.ghi')
    expect(result.candidates[0].insertText).toEqual('def')
    expect(result.candidates[1].insertText).toEqual('def.ghi')
  })

  test("complete ColumnName:cursor on first char:using alias", () => {
    const result = complete('SELECT t.abc.de FROM TABLE1 as t', { line: 0, column: 15 }, SIMPLE_NESTED_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('abc.def')
    expect(result.candidates[1].label).toEqual('abc.def.ghi')
    expect(result.candidates[0].insertText).toEqual('f')
    expect(result.candidates[1].insertText).toEqual('f.ghi')
  })
})

const COMPLEX_SCHEMA = {
  tables: [
    {
      database: null,
      tableName: 'employees',
      columns: [
        { columnName: 'job_id', description: '' },
        { columnName: 'employee_id', description: '' },
        { columnName: 'manager_id', description: '' },
        { columnName: 'department_id', description: '' },
        { columnName: 'first_name', description: '' },
        { columnName: 'last_name', description: '' },
        { columnName: 'email', description: '' },
        { columnName: 'phone_number', description: '' },
        { columnName: 'hire_date', description: '' },
        { columnName: 'salary', description: '' },
        { columnName: 'commision_pct', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'jobs',
      columns: [
        { columnName: 'job_id', description: '' },
        { columnName: 'job_title', description: '' },
        { columnName: 'min_salary', description: '' },
        { columnName: 'max_salary', description: '' },
        { columnName: 'created_at', description: '' },
        { columnName: 'updated_at', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'job_history',
      columns: [
        { columnName: 'employee_id', description: '' },
        { columnName: 'start_date', description: '' },
        { columnName: 'end_date', description: '' },
        { columnName: 'job_id', description: '' },
        { columnName: 'department_id', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'departments',
      columns: [
        { columnName: 'department_id', description: '' },
        { columnName: 'department_name', description: '' },
        { columnName: 'manager_id', description: '' },
        { columnName: 'location_id', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'locations',
      columns: [
        { columnName: 'location_id', description: '' },
        { columnName: 'street_address', description: '' },
        { columnName: 'postal_code', description: '' },
        { columnName: 'city', description: '' },
        { columnName: 'state_province', description: '' },
        { columnName: 'country_id', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'countries',
      columns: [
        { columnName: 'country_id', description: '' },
        { columnName: 'country_name', description: '' },
        { columnName: 'region_id', description: '' },
      ]
    },
    {
      database: null,
      tableName: 'regions',
      columns: [
        { columnName: 'region_id', description: '' },
        { columnName: 'region_name', description: '' },
      ]
    },
  ],
  functions: []
}


test("conplete columns from alias that start chars same as other table", () => {
  const sql = `
    SELECT jo.
      FROM employees jo
        JOIN jobs job
          ON jo.job_id = job.job_id
  `
  const result = complete(sql, { line: 1, column: 14 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(11)
})

test("conplete columns from alias that start chars same as other table", () => {
  const sql = `
    SELECT job.
      FROM employees jo
        JOIN jobs job
          ON jo.job_id = job.job_id
  `
  const result = complete(sql, { line: 1, column: 15 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(6)
})

test("complete column, alias name matches a table from schema, but should not use it", () => {
  const sql = `
    SELECT countr.first_na
      FROM employees countr
  `
  const result = complete(sql, { line: 1, column: 26 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(1)
})

test("conplete columns from duplicated alias", () => {
  const sql = `
    SELECT dm.
      FROM employees e
        JOIN jobs j
          ON e.job_id = j.job_id
        LEFT JOIN employees m
          ON e.manager_id = m.manager_id
        LEFT JOIN departments d
          ON d.department_id = e.department_id
        LEFT JOIN employees dm
          ON d.manager_id = dm.employee_id
  `
  const result = complete(sql, { line: 1, column: 14 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(11)
})

test("conplete columns innside function", () => {
  const sql = `
    SELECT
      e.employee_id AS "Employee #"
      , e.first_name || ' ' || e.last_name AS "Name"
      , e.email AS "Email"
      , e.phone_number AS "Phone"
      , TO_CHAR(e., 'MM/DD/YYYY') AS "Hire Date"
    FROM employees e
      JOIN jobs j
        ON e.job_id = j.job_id
      LEFT JOIN employees m
        ON e.manager_id = m.manager_id
      LEFT JOIN departments d
        ON d.department_id = e.department_id
      LEFT JOIN employees dm
        ON d.manager_id = dm.employee_id
      LEFT JOIN locations l
        ON d.location_id = l.location_id
      LEFT JOIN countries c
        ON l.country_id = c.country_id
      LEFT JOIN regions r
        ON c.region_id = r.region_id
      LEFT JOIN job_history jh
        ON e.employee_id = jh.employee_id
      LEFT JOIN jobs jj
        ON jj.job_id = jh.job_id
      LEFT JOIN departments d
        ON dd.department_id = jh.department_id
      ORDER BY e.employee_id;
  `
  const result = complete(sql, { line: 6, column: 18 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(11)
})

test("conplete columns innside function", () => {
  const sql = `SELECT TO_CHAR(x.departm, 'MM/DD/YYYY') FROM employees x`
  const result = complete(sql, { line: 0, column: 24 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(1)
  expect(result.candidates[0].label).toEqual('department_id')
  expect(result.candidates[0].insertText).toEqual('ent_id')
})

test("conplete columns innside function", () => {
  const sql = `SELECT TO_CHAR(empl, 'MM/DD/YYYY') FROM employees x`
  const result = complete(sql, { line: 0, column: 19 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(1)
  expect(result.candidates[0].label).toEqual('employees')
  //expect(result.candidates[0].insertText).toEqual('oyees')
})

test("conplete columns innside function", () => {
  const sql = `SELECT TO_CHAR(an_ali, 'MM/DD/YYYY') FROM employees an_alias`
  const result = complete(sql, { line: 0, column: 21 }, COMPLEX_SCHEMA)
  expect(result.candidates.length).toEqual(1)
  expect(result.candidates[0].label).toEqual('an_alias')
  //expect(result.candidates[0].insertText).toEqual('as')
})

describe('From clause subquery', () => {
  test("complete column name inside from clause subquery", () => {
    const sql = 'SELECT sub FROM (SELECT e. FROM employees e) sub'
    const result = complete(sql, { line: 0, column: 26 }, COMPLEX_SCHEMA)
    expect(result.candidates.length).toEqual(11)
  })

  test("complete column name inside from clause subquery:nested", () => {
    const sql = 'SELECT sub FROM (SELECT e.employee_id FROM (SELECT e2. FROM employees e2) e) sub'
    const result = complete(sql, { line: 0, column: 54 }, COMPLEX_SCHEMA)
    expect(result.candidates.length).toEqual(11)
  })

  test("complete column name inside from clause subquery:multiline", () => {
    const sql = 'SELECT sub\n FROM (SELECT e. FROM employees e) sub'
    const result = complete(sql, { line: 1, column: 16 }, COMPLEX_SCHEMA)
    expect(result.candidates.length).toEqual(11)
  })

  test("complete column name from subquery", () => {
    const sql = 'SELECT sub. FROM (SELECT e.employee_id sub_id FROM employees e) sub'
    const result = complete(sql, { line: 0, column: 11 }, COMPLEX_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('sub_id')
  })
})

describe('INSERT statement', () => {
  test('complete table name', () => {
    const sql = 'INSERT INTO T'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })

  test('complete column name', () => {
    const sql = 'INSERT INTO TABLE1 (C'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })
})

describe('UPDATE statement', () => {
  test('complete table name', () => {
    const sql = 'UPDATE T'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })

  test('complete column name', () => {
    const sql = 'UPDATE TABLE1 SET C'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })
})

describe('DELETE statement', () => {
  test('complete table name', () => {
    const sql = 'DELETE FROM T'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(1)
    expect(result.candidates[0].label).toEqual('TABLE1')
  })

  test('complete table name', () => {
    const sql = 'DELETE FROM TABLE1 WHERE C'
    const result = complete(sql, { line: 0, column: sql.length }, SIMPLE_SCHEMA)
    expect(result.candidates.length).toEqual(2)
    expect(result.candidates[0].label).toEqual('COLUMN1')
    expect(result.candidates[1].label).toEqual('COLUMN2')
  })
})
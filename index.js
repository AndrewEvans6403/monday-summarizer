import fetch from 'node-fetch';

const MONDAY_TOKEN = process.env.MONDAY_TOKEN;
const BOARD_ID = process.env.BOARD_ID;
const NUMBER_COLUMN_ID = 'numbers'; // Replace with your column ID

const mondayApi = async (query, variables = {}) => {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  return data;
};

async function fetchGroups() {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        groups {
          id
        }
      }
    }
  `;
  const res = await mondayApi(query);
  return res.data.boards[0].groups.map(group => group.id);
}

async function fetchItemsInGroup(groupId) {
  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        groups(ids: "${groupId}") {
          items {
            id
            name
            column_values {
              id
              value
            }
          }
        }
      }
    }
  `;
  const res = await mondayApi(query);
  return res.data.boards[0].groups[0].items;
}

async function updateItemNumber(itemId, newValue) {
  const mutation = `
    mutation ($itemId: Int!, $boardId: Int!, $value: JSON!) {
      change_column_value(
        item_id: $itemId,
        board_id: $boardId,
        column_id: "${NUMBER_COLUMN_ID}",
        value: $value
      ) {
        id
      }
    }
  `;
  await mondayApi(mutation, {
    itemId,
    boardId: parseInt(BOARD_ID),
    value: JSON.stringify({ "number": newValue })
  });
}

async function archiveItem(itemId) {
  const mutation = `
    mutation {
      archive_item(item_id: ${itemId}) {
        id
      }
    }
  `;
  await mondayApi(mutation);
}

async function processBoard() {
  const groupIds = await fetchGroups();

  for (let groupId of groupIds) {
    const items = await fetchItemsInGroup(groupId);

    const groupedByName = {};

    for (let item of items) {
      const numberValRaw = item.column_values.find(col => col.id === NUMBER_COLUMN_ID)?.value;
      const numberVal = numberValRaw ? parseFloat(JSON.parse(numberValRaw)) : 0;

      if (!groupedByName[item.name]) {
        groupedByName[item.name] = [];
      }

      groupedByName[item.name].push({ id: item.id, value: numberVal });
    }

    for (let [name, itemList] of Object.entries(groupedByName)) {
      if (itemList.length > 1) {
        const total = itemList.reduce((sum, item) => sum + item.value, 0);
        const [first, ...rest] = itemList;

        await updateItemNumber(first.id, total);

        for (let dup of rest) {
          await archiveItem(dup.id);
        }

        console.log(`Combined ${itemList.length} items named "${name}" in group ${groupId}`);
      }
    }
  }

  console.log("✅ Done combining duplicates.");
}

processBoard();

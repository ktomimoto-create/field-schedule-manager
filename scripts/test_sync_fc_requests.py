# -*- coding: utf-8 -*-
import unittest
from sync_fc_requests import parse_list, date_from_refno

# lst_detail.php の応答を模した最小 HTML（列: No|日付|号機|物件名|住所|症状・指示|対応状況|緊急|未連絡|詳細）
FIXTURE = """
<table>
<tr><td>No</td><td>日付</td><td>号機</td><td>物件名</td><td>住所</td><td>症状</td><td>対応状況</td></tr>
<tr><input type="hidden" name="refno" value="12609110001">
<td>1</td><td>26/09/11</td><td>507278</td><td>サンデュエル東鷲宮</td><td>埼玉県久喜市桜田2-2-2</td>
<td>BOX開かない</td><td>対応中</td></tr>
<tr><input type=hidden name=refno value=12609110002>
<td>2</td><td>26/09/11</td><td>17603</td><td>THE　PLACE　KYODO</td><td>東京都世田谷区経堂1-1-1</td>
<td>&nbsp;液晶 <b>不良</b></td><td></td></tr>
<tr><td>ヘッダ行や refno の無い行は無視される</td></tr>
</table>
"""


class TestParseList(unittest.TestCase):
    def test_parse_two_rows(self):
        rows = parse_list(FIXTURE)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], {
            'refno': '12609110001',
            'unit_number': '507278',
            'property_name': 'サンデュエル東鷲宮',
            'address': '埼玉県久喜市桜田2-2-2',
            'request_date': '2026-09-11',
        })

    def test_tags_and_nbsp_stripped(self):
        rows = parse_list(FIXTURE)
        self.assertEqual(rows[1]['property_name'], 'THE　PLACE　KYODO')
        self.assertEqual(rows[1]['unit_number'], '17603')

    def test_date_from_refno(self):
        self.assertEqual(date_from_refno('12609110001'), '2026-09-11')
        self.assertEqual(date_from_refno('bad'), None)


if __name__ == '__main__':
    unittest.main()

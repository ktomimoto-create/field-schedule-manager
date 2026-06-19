export interface ResolvedAddress {
  prefecture: string;
  area: string;
}

export function resolveAddress(rawAddress: string): ResolvedAddress {
  const address = rawAddress.trim();
  const prefs = [
    '東京都', '東京', '神奈川県', '神奈川', '埼玉県', '埼玉', '千葉県', '千葉',
    '栃木県', '栃木', '群馬県', '群馬', '茨城県', '茨城', '新潟県', '新潟',
    '長野県', '長野', '静岡県', '静岡', '山梨県', '山梨'
  ];

  let rawPref = '';
  let restAddress = '';

  for (const p of prefs) {
    if (address.startsWith(p)) {
      rawPref = p.replace(/都|県|府|道/, '');
      restAddress = address.substring(p.length).trim();
      break;
    }
  }

  if (!rawPref) {
    return { prefecture: '', area: '' };
  }

  let prefectureVal = rawPref;
  let areaVal = '';

  // 重複区のアルファベット変換ヘルパー
  const appendSuffixForDuplicateSections = (zoneName: string, suffix: string) => {
    const targetWards = ['中央区', '北区', '南区', '西区', '緑区'];
    if (targetWards.includes(zoneName)) {
      return zoneName + suffix;
    }
    return zoneName;
  };

  if (rawPref === '東京') {
    const wardMatch = restAddress.match(/^([^市区町村\s]+?区)/);
    if (wardMatch) {
      prefectureVal = '23';
      areaVal = appendSuffixForDuplicateSections(wardMatch[1], 'T');
    } else {
      prefectureVal = '都下';
      const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
      areaVal = otherMatch ? otherMatch[1] : '';
    }
  } else if (rawPref === '千葉') {
    if (restAddress.startsWith('千葉市')) {
      const subAddress = restAddress.substring(3).trim();
      const wardMatch = subAddress.match(/^([^市区町村\s]+?区)/);
      areaVal = wardMatch ? appendSuffixForDuplicateSections(wardMatch[1], 'C') : '千葉市';
    } else {
      const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
      areaVal = otherMatch ? otherMatch[1] : '';
    }
  } else if (rawPref === '埼玉') {
    if (restAddress.startsWith('さいたま市')) {
      const subAddress = restAddress.substring(5).trim();
      const wardMatch = subAddress.match(/^([^市区町村\s]+?区)/);
      areaVal = wardMatch ? appendSuffixForDuplicateSections(wardMatch[1], 'S') : 'さいたま市';
    } else {
      const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
      areaVal = otherMatch ? otherMatch[1] : '';
    }
  } else if (rawPref === '神奈川') {
    if (restAddress.startsWith('横浜市')) {
      const subAddress = restAddress.substring(3).trim();
      const wardMatch = subAddress.match(/^([^市区町村\s]+?区)/);
      areaVal = wardMatch ? appendSuffixForDuplicateSections(wardMatch[1], 'K') : '横浜市';
    } else if (restAddress.startsWith('川崎市')) {
      const subAddress = restAddress.substring(3).trim();
      const wardMatch = subAddress.match(/^([^市区町村\s]+?区)/);
      areaVal = wardMatch ? appendSuffixForDuplicateSections(wardMatch[1], 'K') : '川崎市';
    } else {
      const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
      areaVal = otherMatch ? otherMatch[1] : '';
    }
  } else if (rawPref === '静岡') {
    if (restAddress.startsWith('静岡市')) {
      const subAddress = restAddress.substring(3).trim();
      const wardMatch = subAddress.match(/^([^市区町村\s]+?区)/);
      areaVal = wardMatch ? wardMatch[1] : '静岡市';
    } else {
      const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
      areaVal = otherMatch ? otherMatch[1] : '';
    }
  } else {
    const otherMatch = restAddress.match(/^([^市区町村\s]+?[市区町村郡])/);
    areaVal = otherMatch ? otherMatch[1] : '';
  }

  return { prefecture: prefectureVal, area: areaVal };
}

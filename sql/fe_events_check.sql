-- fe_events.sql を流したあとの確認。Supabase の SQL Editor で丸ごと実行する。
-- 最後にわざとエラーで止めて全部取り消すので、データは何も残らない。
-- 結果はエラーの文として出る:
--   「確認OK: …」なら成功 / それ以外のエラーなら、その文が失敗の理由
-- 対応者が決まっている予定を 1 件選び、その対応者になりすまして 出発 → 到着 → 作業完了 → 取り消し を試す。

do $$
declare
  v_sched bigint;
  v_staff bigint;
  v_email text;
  v_row public.schedules%rowtype;
  v_started text;
  v_direct_blocked boolean := false;
begin
  select sc.id, st.id, st.email into v_sched, v_staff, v_email
  from public.schedules sc
  join public.staff st on st.id = sc.staff_id
  where st.email is not null and st.email <> ''
  order by sc.id desc
  limit 1;
  if v_sched is null then
    raise exception '試せる予定がありません（対応者のメールが登録された予定が無い）';
  end if;

  -- その人としてログインしている状態にする（このブロックの中だけ）
  perform set_config('request.jwt.claims', json_build_object('email', v_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  if public.fe_my_staff_id() is distinct from v_staff then
    raise exception 'ログインのメールから担当者を決められませんでした（staff.email と突き合わせ）';
  end if;

  perform public.fe_record_event('shift_start');
  perform public.fe_record_event('depart', v_sched);
  perform public.fe_record_event('arrive', v_sched);
  select * into v_row from public.schedules where id = v_sched;
  v_started := v_row.started_at;
  if coalesce(v_started, '') = '' then
    raise exception '到着で started_at が書かれませんでした';
  end if;

  perform public.fe_record_event('finish', v_sched);
  select * into v_row from public.schedules where id = v_sched;
  if coalesce(v_row.completed_at, '') = '' or v_row.result is distinct from '完了' then
    raise exception '作業完了で completed_at / result が書かれませんでした';
  end if;

  perform public.fe_undo_last_event();
  select * into v_row from public.schedules where id = v_sched;
  if v_row.completed_at is not null or coalesce(v_row.result, '') <> '' then
    raise exception '取り消しで completed_at / result が戻りませんでした';
  end if;

  -- 直接の書き込みは拒否されること
  begin
    insert into public.fe_events (staff_id, kind) values (v_staff, 'shift_start');
  exception when insufficient_privilege then
    v_direct_blocked := true;
  end;
  if not v_direct_blocked then
    raise exception '直接の書き込みが通ってしまいました（RPC だけにするはず）';
  end if;

  raise exception '確認OK: 予定 % / 担当 % で 出発・到着（%）・作業完了・取り消し・直接書き込みの拒否 を確かめました（すべて取り消し済み）', v_sched, v_staff, v_started;
end;
$$;

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type AssignmentRow = {
  staff_id: string;
  school_id: string;
  schools?: { name?: string | null } | null;
};

function findAssignForm() {
  return Array.from(document.querySelectorAll('form')).find((form) => {
    const title = form.querySelector('h2')?.textContent?.toLowerCase() || '';
    return title.includes('assign staff') && title.includes('school');
  }) as HTMLFormElement | undefined;
}

function findStatusText() {
  const status = document.querySelector('.status.info, .status.success, .status.error') as HTMLElement | null;
  const text = status?.textContent?.trim() || '';
  if (!text || text.length < 3) return '';
  return text;
}

export function AdminPageEnhancements() {
  const location = useLocation();
  const [toast, setToast] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const isAdminPage = location.pathname === '/admin';

  async function loadAssignments() {
    const { data } = await supabase.from('staff_school_assignments').select('staff_id, school_id, schools(name)');
    setAssignments((data || []) as AssignmentRow[]);
  }

  useEffect(() => {
    if (!isAdminPage) return;
    loadAssignments();
    const timer = window.setInterval(loadAssignments, 8000);
    return () => window.clearInterval(timer);
  }, [isAdminPage]);

  const assignmentKey = useMemo(() => JSON.stringify(assignments), [assignments]);

  useEffect(() => {
    if (!isAdminPage) return;
    let lastText = '';
    const showPopup = (text: string) => {
      if (!text || text === lastText) return;
      lastText = text;
      setToast(text);
      window.setTimeout(() => setToast((current) => current === text ? '' : current), 4500);
    };
    const scan = () => showPopup(findStatusText());
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isAdminPage]);

  useEffect(() => {
    if (!isAdminPage) return;

    function updateAssignmentBox() {
      const form = findAssignForm();
      if (!form) return;
      const selects = form.querySelectorAll('select');
      const staffSelect = selects[0] as HTMLSelectElement | undefined;
      const schoolSelect = selects[1] as HTMLSelectElement | undefined;
      if (!staffSelect || !schoolSelect) return;

      let box = form.querySelector('.assignment-status-box') as HTMLDivElement | null;
      if (!box) {
        box = document.createElement('div');
        box.className = 'assignment-status-box';
        staffSelect.closest('label')?.insertAdjacentElement('afterend', box);
      }

      const staffId = staffSelect.value;
      const schoolId = schoolSelect.value;
      const rows = assignments.filter((row) => row.staff_id === staffId);
      const duplicate = rows.some((row) => row.school_id === schoolId);
      const names = rows.map((row) => row.schools?.name || 'Unnamed school').join(', ');
      const selectedName = staffSelect.options[staffSelect.selectedIndex]?.text || 'Selected staff';

      box.innerHTML = rows.length
        ? `<strong>${selectedName}</strong><span>Already assigned to: ${names}</span>${duplicate ? '<em>This teacher is already assigned to the selected school. Choose another school to avoid duplicate assignment.</em>' : '<em>You can assign this teacher to another school.</em>'}`
        : `<strong>${selectedName}</strong><span>No school assignment found yet.</span><em>You can assign this teacher to one or more schools.</em>`;
      box.classList.toggle('duplicate', duplicate);

      const button = form.querySelector('button.primary') as HTMLButtonElement | null;
      if (button) {
        button.disabled = duplicate;
        button.textContent = duplicate ? 'Already Assigned' : 'Assign School';
      }
    }

    const blockDuplicateSubmit = (event: Event) => {
      const form = findAssignForm();
      if (!form || event.target !== form) return;
      const selects = form.querySelectorAll('select');
      const staffId = (selects[0] as HTMLSelectElement | undefined)?.value;
      const schoolId = (selects[1] as HTMLSelectElement | undefined)?.value;
      const duplicate = assignments.some((row) => row.staff_id === staffId && row.school_id === schoolId);
      if (duplicate) {
        event.preventDefault();
        event.stopPropagation();
        setToast('This teacher is already assigned to the selected school. No duplicate assignment was created.');
      }
    };

    updateAssignmentBox();
    const observer = new MutationObserver(updateAssignmentBox);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', updateAssignmentBox, true);
    document.addEventListener('submit', blockDuplicateSubmit, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('change', updateAssignmentBox, true);
      document.removeEventListener('submit', blockDuplicateSubmit, true);
    };
  }, [isAdminPage, assignmentKey]);

  if (!isAdminPage || !toast) return null;
  return <div className="admin-toast-popup"><strong>Done</strong><span>{toast}</span><button type="button" onClick={() => setToast('')}>×</button></div>;
}
